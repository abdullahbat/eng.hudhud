import {
  CampusData,
  CampusSettings,
  FacilityData,
  FloorData,
  LandmarkData,
  NodeData,
  Point2D,
  getFloorMetersPerPixel,
} from './validator';

export type RouteStartInput =
  | { type: 'facility'; code: string }
  | { type: 'landmark'; id: string }
  | { type: 'point'; floorId: string; x: number; y: number };

export interface RouteOptions {
  preferElevator?: boolean;
}

export interface StraightSegmentLabel {
  from: Point2D;
  to: Point2D;
  midPoint: Point2D;
  distanceMeters: number;
}

export interface FloorRouteSegment {
  floorId: string;
  floorName: string;
  points: Point2D[];
  nodeIds: string[];
  distanceMeters: number;
  straightSegments: StraightSegmentLabel[];
  stepsText: string[];
  connectorToNext?: {
    name: string;
    type: 'stairs' | 'elevator';
    targetFloorId: string;
    targetFloorName: string;
  };
}

export interface RouteResult {
  found: boolean;
  error?: string;
  totalDistanceMeters: number;
  segments: FloorRouteSegment[];
  fullDescription: string;
  destinationFacility?: FacilityData;
}

interface GraphEdge {
  to: string;
  walkMeters: number;
  costMeters: number;
  isConnector: boolean;
  connectorName?: string;
  connectorType?: 'stairs' | 'elevator';
}

/**
 * يسقط أي نقطة نقرها الطالب على الخريطة على أقرب موضع في أقرب ممر بنفس الدور
 */
export function snapPointToCorridor(
  data: CampusData,
  floorId: string,
  clickX: number,
  clickY: number
): {
  projectedPoint: Point2D;
  edgeId: string;
  nodeA: NodeData;
  nodeB: NodeData;
  distToAMeters: number;
  distToBMeters: number;
} | null {
  const floor = data.floors.find((f) => f.id === floorId);
  if (!floor) return null;
  const mpp = getFloorMetersPerPixel(floor) ?? 0.1;

  const nodesById = new Map<string, NodeData>();
  for (const n of data.nodes) {
    nodesById.set(n.id, n);
  }

  // نفضّل الممرات الأساسية (غير وصلات الأبواب القصيرة) إن وجدت، وإلا كل ممرات الدور
  const floorEdges = data.edges.filter((e) => e.floorId === floorId);
  const mainEdges = floorEdges.filter((e) => !e.id.includes('-edoor-'));
  const candidateEdges = mainEdges.length > 0 ? mainEdges : floorEdges;

  let best: {
    distPx: number;
    projX: number;
    projY: number;
    edgeId: string;
    nodeA: NodeData;
    nodeB: NodeData;
    distToAMeters: number;
    distToBMeters: number;
  } | null = null;

  for (const edge of candidateEdges) {
    const nA = nodesById.get(edge.from);
    const nB = nodesById.get(edge.to);
    if (!nA || !nB) continue;

    const dx = nB.x - nA.x;
    const dy = nB.y - nA.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = ((clickX - nA.x) * dx + (clickY - nA.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projX = nA.x + t * dx;
    const projY = nA.y + t * dy;
    const distPx = Math.hypot(clickX - projX, clickY - projY);

    const edgeTotalMeters = edge.manualLengthMeters ?? edge.computedLengthMeters;
    const distToAMeters = t * edgeTotalMeters;
    const distToBMeters = (1 - t) * edgeTotalMeters;

    if (!best || distPx < best.distPx) {
      best = {
        distPx,
        projX,
        projY,
        edgeId: edge.id,
        nodeA: nA,
        nodeB: nB,
        distToAMeters,
        distToBMeters,
      };
    }
  }

  if (!best) return null;
  return {
    projectedPoint: { x: Math.round(best.projX), y: Math.round(best.projY) },
    edgeId: best.edgeId,
    nodeA: best.nodeA,
    nodeB: best.nodeB,
    distToAMeters: best.distToAMeters,
    distToBMeters: best.distToBMeters,
  };
}

/**
 * يحدد اتجاه الانعطاف (يميناً أو يساراً) في نظام إحداثيات الصور حيث محور y يتجه للأسفل:
 * الضرب الاتجاهي cross = v1x * v2y - v1y * v2x
 * إذا كان cross > 0 فالانعطاف يميناً، وإذا كان cross < 0 فالانعطاف يساراً
 */
export function getTurnDirection(
  pPrev: Point2D,
  pCurr: Point2D,
  pNext: Point2D
): 'right' | 'left' | 'straight' {
  const v1x = pCurr.x - pPrev.x;
  const v1y = pCurr.y - pPrev.y;
  const v2x = pNext.x - pCurr.x;
  const v2y = pNext.y - pCurr.y;

  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1e-3 || len2 < 1e-3) return 'straight';

  const cross = (v1x * v2y - v1y * v2x) / (len1 * len2);
  if (Math.abs(cross) < 0.25) {
    return 'straight';
  }
  return cross > 0 ? 'right' : 'left';
}

function findNearestContextName(
  point: Point2D,
  floorId: string,
  data: CampusData,
  nodesById: Map<string, NodeData>,
  excludeCodes: Set<string>
): string | null {
  let bestName: string | null = null;
  let bestDist = 160; // ضمن مسافة قريبة على الخريطة (حوالي 16 متراً)

  for (const lm of data.landmarks) {
    if (lm.floorId !== floorId) continue;
    const nd = nodesById.get(lm.nodeId);
    if (!nd) continue;
    const d = Math.hypot(nd.x - point.x, nd.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      bestName = lm.name;
    }
  }

  for (const fac of data.facilities) {
    if (fac.floorId !== floorId || excludeCodes.has(fac.code)) continue;
    if (fac.type === 'prayer' || fac.type === 'elevator' || fac.type === 'stairs' || fac.type === 'entrance') {
      const nd = nodesById.get(fac.nodeId);
      if (!nd) continue;
      const d = Math.hypot(nd.x - point.x, nd.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        bestName = fac.connectorGroup || fac.name;
      }
    }
  }

  return bestName;
}

/**
 * يحسب أقصر مسار باستخدام خوارزمية Dijkstra مع دعم الانتقال بين الأدوار وخيار تفضيل المصعد
 */
export function findShortestRoute(
  data: CampusData,
  start: RouteStartInput,
  destinationFacilityCode: string,
  options: RouteOptions = {},
  settings?: CampusSettings
): RouteResult {
  const floorsById = new Map<string, FloorData>();
  for (const f of data.floors) {
    floorsById.set(f.id, f);
  }

  const nodesById = new Map<string, NodeData>();
  for (const n of data.nodes) {
    nodesById.set(n.id, n);
  }

  const facilitiesByCode = new Map<string, FacilityData>();
  for (const fac of data.facilities) {
    facilitiesByCode.set(fac.code.trim().toUpperCase(), fac);
  }

  const destFac = facilitiesByCode.get(destinationFacilityCode.trim().toUpperCase());
  if (!destFac) {
    return {
      found: false,
      error: `الوجهة المطلوبة «${destinationFacilityCode}» غير موجودة في بيانات الكلية.`,
      totalDistanceMeters: 0,
      segments: [],
      fullDescription: `الوجهة المطلوبة «${destinationFacilityCode}» غير موجودة في بيانات الكلية.`,
    };
  }

  // تجهيز عقدة البداية
  let startNodeId = '';
  let virtualNode: NodeData | null = null;
  let startFacilityCode = '';

  if (start.type === 'facility') {
    const sFac = facilitiesByCode.get(start.code.trim().toUpperCase());
    if (!sFac) {
      return {
        found: false,
        error: `نقطة البداية «${start.code}» غير موجودة.`,
        totalDistanceMeters: 0,
        segments: [],
        fullDescription: `نقطة البداية «${start.code}» غير موجودة.`,
      };
    }
    startNodeId = sFac.nodeId;
    startFacilityCode = sFac.code;
  } else if (start.type === 'landmark') {
    const lm: LandmarkData | undefined = data.landmarks.find((l) => l.id === start.id);
    if (!lm) {
      return {
        found: false,
        error: `المعلم المحدد غير موجود.`,
        totalDistanceMeters: 0,
        segments: [],
        fullDescription: `المعلم المحدد غير موجود.`,
      };
    }
    startNodeId = lm.nodeId;
  } else if (start.type === 'point') {
    const snapped = snapPointToCorridor(data, start.floorId, start.x, start.y);
    if (!snapped) {
      return {
        found: false,
        error: `تعذّر إسقاط النقطة المختارة على أي ممر في هذا الدور.`,
        totalDistanceMeters: 0,
        segments: [],
        fullDescription: `تعذّر إسقاط النقطة المختارة على أي ممر في هذا الدور.`,
      };
    }
    startNodeId = '__virtual_start__';
    virtualNode = {
      id: startNodeId,
      floorId: start.floorId,
      x: snapped.projectedPoint.x,
      y: snapped.projectedPoint.y,
      kind: 'junction',
    };
    nodesById.set(startNodeId, virtualNode);
  }

  // إذا كانت نقطة البداية هي نفس الوجهة
  if (
    startNodeId === destFac.nodeId ||
    (startFacilityCode && startFacilityCode.toUpperCase() === destFac.code.toUpperCase())
  ) {
    const fObj = floorsById.get(destFac.floorId);
    const startPt = nodesById.get(destFac.nodeId) ?? { x: 0, y: 0 };
    const msg = `أنت بالفعل عند «${destFac.name}» (${destFac.code}). المسافة الكلية 0 م.`;
    return {
      found: true,
      totalDistanceMeters: 0,
      destinationFacility: destFac,
      segments: [
        {
          floorId: destFac.floorId,
          floorName: fObj?.name ?? destFac.floorId,
          points: [{ x: startPt.x, y: startPt.y }],
          nodeIds: [destFac.nodeId],
          distanceMeters: 0,
          straightSegments: [],
          stepsText: [msg],
        },
      ],
      fullDescription: msg,
    };
  }

  // بناء شبكة الجراف (Adjacency List)
  const adj = new Map<string, GraphEdge[]>();
  const ensureAdj = (id: string) => {
    if (!adj.has(id)) adj.set(id, []);
  };

  for (const n of nodesById.keys()) {
    ensureAdj(n);
  }

  for (const edge of data.edges) {
    const lengthM = edge.manualLengthMeters ?? edge.computedLengthMeters;
    if (lengthM <= 0) continue;
    ensureAdj(edge.from);
    ensureAdj(edge.to);
    adj.get(edge.from)!.push({
      to: edge.to,
      walkMeters: lengthM,
      costMeters: lengthM,
      isConnector: false,
    });
    adj.get(edge.to)!.push({
      to: edge.from,
      walkMeters: lengthM,
      costMeters: lengthM,
      isConnector: false,
    });
  }

  // إذا كانت البداية نقطة نقر على الخريطة، نربطها بطرفي الممر المسقطة عليه
  if (virtualNode && start.type === 'point') {
    const snapped = snapPointToCorridor(data, start.floorId, start.x, start.y)!;
    adj.get(startNodeId)!.push({
      to: snapped.nodeA.id,
      walkMeters: snapped.distToAMeters,
      costMeters: snapped.distToAMeters,
      isConnector: false,
    });
    adj.get(startNodeId)!.push({
      to: snapped.nodeB.id,
      walkMeters: snapped.distToBMeters,
      costMeters: snapped.distToBMeters,
      isConnector: false,
    });
  }

  // إضافة وصلات الانتقال بين الأدوار عبر الدرج والمصاعد ذات الأسماء الثابتة
  const stairsCostPerFloor = settings?.routingCosts?.stairsMetersPerFloor ?? 15;
  const elevatorWaitCost = settings?.routingCosts?.elevatorMetersPerWait ?? 25;

  const addInterFloorLinks = (allowStairs: boolean) => {
    const groups = new Map<string, FacilityData[]>();
    for (const fac of data.facilities) {
      if (fac.type !== 'stairs' && fac.type !== 'elevator') continue;
      if (fac.type === 'stairs' && !allowStairs) continue;
      const gName = (fac.connectorGroup || fac.name || fac.code).trim();
      if (!groups.has(gName)) groups.set(gName, []);
      groups.get(gName)!.push(fac);
    }

    for (const [gName, list] of groups.entries()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const f1 = list[i];
          const f2 = list[j];
          if (f1.floorId === f2.floorId) continue;
          const floor1 = floorsById.get(f1.floorId);
          const floor2 = floorsById.get(f2.floorId);
          const floorDiff = Math.max(1, Math.abs((floor2?.order ?? 0) - (floor1?.order ?? 0)));

          const cType = f1.type as 'stairs' | 'elevator';
          const penalty =
            cType === 'stairs' ? stairsCostPerFloor * floorDiff : elevatorWaitCost;

          ensureAdj(f1.nodeId);
          ensureAdj(f2.nodeId);
          adj.get(f1.nodeId)!.push({
            to: f2.nodeId,
            walkMeters: 0,
            costMeters: penalty,
            isConnector: true,
            connectorName: gName,
            connectorType: cType,
          });
          adj.get(f2.nodeId)!.push({
            to: f1.nodeId,
            walkMeters: 0,
            costMeters: penalty,
            isConnector: true,
            connectorName: gName,
            connectorType: cType,
          });
        }
      }
    }
  };

  const runDijkstra = (): {
    pathNodes: string[];
    connectorSteps: Map<number, GraphEdge>;
  } | null => {
    const dist = new Map<string, number>();
    const prev = new Map<string, { from: string; edge: GraphEdge }>();
    const visited = new Set<string>();

    for (const k of adj.keys()) {
      dist.set(k, Infinity);
    }
    dist.set(startNodeId, 0);

    while (true) {
      let u: string | null = null;
      let bestD = Infinity;
      for (const [nodeId, dVal] of dist.entries()) {
        if (!visited.has(nodeId) && dVal < bestD) {
          bestD = dVal;
          u = nodeId;
        }
      }

      if (u === null || bestD === Infinity) break;
      if (u === destFac.nodeId) break;
      visited.add(u);

      for (const edge of adj.get(u) ?? []) {
        if (visited.has(edge.to)) continue;
        const alt = bestD + edge.costMeters;
        if (alt < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, { from: u, edge });
        }
      }
    }

    if ((dist.get(destFac.nodeId) ?? Infinity) === Infinity) {
      return null;
    }

    const pathNodes: string[] = [];
    const reverseEdges: GraphEdge[] = [];
    let curr: string | undefined = destFac.nodeId;
    while (curr !== undefined) {
      pathNodes.push(curr);
      const p = prev.get(curr);
      if (!p) break;
      reverseEdges.push(p.edge);
      curr = p.from;
    }
    pathNodes.reverse();
    reverseEdges.reverse();

    const connectorSteps = new Map<number, GraphEdge>();
    for (let i = 0; i < reverseEdges.length; i++) {
      if (reverseEdges[i].isConnector) {
        connectorSteps.set(i, reverseEdges[i]);
      }
    }

    return { pathNodes, connectorSteps };
  };

  // إذا كان خيار "أفضّل المصعد" مفعلاً، نجرب أولاً بدون أي درج، وإن لم يوجد طريق نسمح بالدرج كحل احتياطي
  addInterFloorLinks(!options.preferElevator);
  let dijkstraRes = runDijkstra();

  if (!dijkstraRes && options.preferElevator) {
    // إعادة المحاولة بالسماح بالدرج إن لم يتوفر مصعد يصل للوجهة
    for (const list of adj.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].isConnector) list.splice(i, 1);
      }
    }
    addInterFloorLinks(true);
    dijkstraRes = runDijkstra();
  }

  if (!dijkstraRes) {
    return {
      found: false,
      error: `لا يوجد مسار متصل يوصل إلى «${destFac.name}» (${destFac.code}).`,
      totalDistanceMeters: 0,
      segments: [],
      fullDescription: `لا يوجد مسار متصل يوصل إلى «${destFac.name}» (${destFac.code}).`,
    };
  }

  // تقسيم المسار إلى مقاطع حسب الدور
  const { pathNodes, connectorSteps } = dijkstraRes;
  const rawSegments: {
    floorId: string;
    nodeIds: string[];
    connectorEdge?: GraphEdge;
    nextFloorId?: string;
  }[] = [];

  let currentList: string[] = [pathNodes[0]];
  let currentFloorId = nodesById.get(pathNodes[0])!.floorId;

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const nextNodeId = pathNodes[i + 1];
    const conn = connectorSteps.get(i);
    if (conn) {
      const nextFloor = nodesById.get(nextNodeId)!.floorId;
      rawSegments.push({
        floorId: currentFloorId,
        nodeIds: currentList,
        connectorEdge: conn,
        nextFloorId: nextFloor,
      });
      currentFloorId = nextFloor;
      currentList = [nextNodeId];
    } else {
      currentList.push(nextNodeId);
    }
  }
  rawSegments.push({
    floorId: currentFloorId,
    nodeIds: currentList,
  });

  // دالة مساعدة لإيجاد طول الحافة بين عقدتين في نفس الدور
  const getEdgeWalkMeters = (u: string, v: string): number => {
    const list = adj.get(u) ?? [];
    const found = list.find((e) => e.to === v && !e.isConnector);
    return found ? found.walkMeters : 0;
  };

  const segments: FloorRouteSegment[] = [];
  let totalUnroundedMeters = 0;

  for (let segIdx = 0; segIdx < rawSegments.length; segIdx++) {
    const raw = rawSegments[segIdx];
    const floorObj = floorsById.get(raw.floorId);
    const floorName = floorObj?.name ?? raw.floorId;

    // استخراج النقاط ودمج المقاطع المستقيمة المتتالية (Collinear points)
    const rawPts: Point2D[] = raw.nodeIds.map((nid) => {
      const nd = nodesById.get(nid)!;
      return { x: nd.x, y: nd.y };
    });

    // نبني المقاطع المستقيمة المدمجة مع حساب طول كل مقطع مستقيم بالمتر
    const mergedPoints: Point2D[] = [rawPts[0]];
    const mergedDistances: number[] = [];

    let accDist = 0;
    for (let i = 0; i < raw.nodeIds.length - 1; i++) {
      const stepDist = getEdgeWalkMeters(raw.nodeIds[i], raw.nodeIds[i + 1]);
      accDist += stepDist;

      const pPrev = mergedPoints[mergedPoints.length - 1];
      const pCurr = rawPts[i + 1];
      const pNext = i + 2 < rawPts.length ? rawPts[i + 2] : null;

      if (pNext && getTurnDirection(pPrev, pCurr, pNext) === 'straight') {
        // استمرار في نفس الخط المستقيم -> ندمج
        continue;
      } else {
        mergedPoints.push(pCurr);
        mergedDistances.push(accDist);
        accDist = 0;
      }
    }

    const straightSegments: StraightSegmentLabel[] = [];
    let segUnroundedSum = 0;

    for (let i = 0; i < mergedDistances.length; i++) {
      const p1 = mergedPoints[i];
      const p2 = mergedPoints[i + 1];
      const dMeters = mergedDistances[i];
      segUnroundedSum += dMeters;
      const roundedSeg = Math.max(1, Math.round(dMeters));
      straightSegments.push({
        from: p1,
        to: p2,
        midPoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        distanceMeters: roundedSeg,
      });
    }

    totalUnroundedMeters += segUnroundedSum;
    const segRoundedMeters = Math.round(segUnroundedSum);

    // بناء الشرح الكتابي بالعربية لهذا المقطع
    const stepsText: string[] = [];
    const excludeCodes = new Set<string>([destFac.code, startFacilityCode]);

    if (straightSegments.length > 0) {
      // نفصل خطوة الدخول القصيرة لباب المرفق في النهاية إن كانت مجرد انعطاف لباب القاعة
      const isLastSegmentFinalDestination = segIdx === rawSegments.length - 1;
      const lastLeg = straightSegments[straightSegments.length - 1];
      const hasShortDoorHook =
        isLastSegmentFinalDestination &&
        straightSegments.length >= 2 &&
        lastLeg.distanceMeters <= 4;

      const walkLegsCount = hasShortDoorHook
        ? straightSegments.length - 1
        : straightSegments.length;

      for (let i = 0; i < walkLegsCount; i++) {
        const leg = straightSegments[i];
        // إذا كان هناك hook صغير للباب في النهاية نضم مسافته لآخر مشي مستقيم ليتطابق المجموع
        const displayMeters =
          hasShortDoorHook && i === walkLegsCount - 1
            ? leg.distanceMeters + lastLeg.distanceMeters
            : leg.distanceMeters;

        if (i === 0) {
          // الخطوة الأولى: لا نذكر يميناً أو يساراً لأن اتجاه الطالب الابتدائي غير معروف
          const targetHint = findNearestContextName(
            leg.to,
            raw.floorId,
            data,
            nodesById,
            excludeCodes
          );
          if (targetHint) {
            stepsText.push(`امشِ ${displayMeters} م باتجاه ${targetHint}`);
          } else {
            stepsText.push(`امشِ للأمام في الممر لمسافة ${displayMeters} م`);
          }
        } else {
          const prevPt = mergedPoints[i - 1];
          const turnPt = mergedPoints[i];
          const nextPt = mergedPoints[i + 1];
          const dir = getTurnDirection(prevPt, turnPt, nextPt);
          const dirArabic = dir === 'right' ? 'يميناً' : 'يساراً';
          const landmarkAtTurn = findNearestContextName(
            turnPt,
            raw.floorId,
            data,
            nodesById,
            excludeCodes
          );
          const nearPhrase = landmarkAtTurn ? ` عند ${landmarkAtTurn}` : '';
          stepsText.push(`ثم انعطف ${dirArabic}${nearPhrase} وامشِ ${displayMeters} م`);
        }
      }

      if (isLastSegmentFinalDestination) {
        if (hasShortDoorHook) {
          const pBefore = mergedPoints[mergedPoints.length - 3];
          const pCorner = mergedPoints[mergedPoints.length - 2];
          const pDoor = mergedPoints[mergedPoints.length - 1];
          const doorSide = getTurnDirection(pBefore, pCorner, pDoor);
          const sideArabic = doorSide === 'right' ? 'على يمينك' : 'على يسارك';
          stepsText.push(`تجد «${destFac.name}» (${destFac.code}) ${sideArabic}.`);
        } else {
          stepsText.push(`تصل إلى «${destFac.name}» (${destFac.code}) أمامك.`);
        }
      }
    }

    let connectorToNext: FloorRouteSegment['connectorToNext'] = undefined;
    if (raw.connectorEdge && raw.nextFloorId) {
      const nextFloorObj = floorsById.get(raw.nextFloorId);
      const nextFloorName = nextFloorObj?.name ?? raw.nextFloorId;
      const curOrder = floorObj?.order ?? 0;
      const nextOrder = nextFloorObj?.order ?? 0;
      const verb = nextOrder > curOrder ? 'اصعد' : 'انزل';
      const cName = raw.connectorEdge.connectorName ?? 'الدرج/المصعد';
      const viaWord = raw.connectorEdge.connectorType === 'elevator' ? `بالمصعد (${cName})` : `بـ${cName}`;
      stepsText.push(`${verb} ${viaWord} إلى ${nextFloorName}، ثم اضغط التالي.`);

      connectorToNext = {
        name: cName,
        type: raw.connectorEdge.connectorType ?? 'stairs',
        targetFloorId: raw.nextFloorId,
        targetFloorName: nextFloorName,
      };
    }

    segments.push({
      floorId: raw.floorId,
      floorName,
      points: rawPts,
      nodeIds: raw.nodeIds,
      distanceMeters: segRoundedMeters,
      straightSegments,
      stepsText,
      connectorToNext,
    });
  }

  const totalDistanceMeters = Math.round(totalUnroundedMeters);
  const allSteps = segments.flatMap((s) => s.stepsText).join('، ');
  const fullDescription = `${allSteps} المسافة الكلية حوالي ${totalDistanceMeters} م.`;

  return {
    found: true,
    totalDistanceMeters,
    segments,
    fullDescription,
    destinationFacility: destFac,
  };
}
