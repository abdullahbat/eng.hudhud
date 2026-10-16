export interface Point2D {
  x: number;
  y: number;
}

export interface FloorScale {
  p1: Point2D;
  p2: Point2D;
  distanceMeters: number;
}

export interface FloorData {
  id: string;
  name: string;
  order: number;
  mapImage: string;
  width: number;
  height: number;
  attribution?: string;
  scale?: FloorScale;
  demo?: boolean;
}

export type NodeKind = 'junction' | 'door' | 'stairs' | 'elevator' | 'entrance';

export interface NodeData {
  id: string;
  floorId: string;
  x: number;
  y: number;
  kind: NodeKind;
  demo?: boolean;
}

export interface EdgeData {
  id: string;
  floorId: string;
  from: string;
  to: string;
  computedLengthMeters: number;
  manualLengthMeters?: number;
  demo?: boolean;
}

export type FacilityType =
  | 'room'
  | 'office'
  | 'prayer'
  | 'wc_men'
  | 'wc_women'
  | 'stairs'
  | 'elevator'
  | 'entrance'
  | 'other';

export interface FacilityData {
  code: string;
  type: FacilityType;
  name: string;
  floorId: string;
  nodeId: string;
  connectorGroup?: string | null;
  demo?: boolean;
}

export interface LandmarkData {
  id: string;
  name: string;
  floorId: string;
  nodeId: string;
  demo?: boolean;
}

export interface DoctorData {
  id: string;
  name: string;
  officeCode: string;
  demo?: boolean;
}

export interface CampusData {
  floors: FloorData[];
  nodes: NodeData[];
  edges: EdgeData[];
  facilities: FacilityData[];
  landmarks: LandmarkData[];
  doctors: DoctorData[];
}

export interface RoomCodeSystemConfig {
  enabled: boolean;
  pattern: string;
  description?: string;
  floorPrefixMap?: Record<string, string>;
}

export interface CampusSettings {
  roomCodeSystem?: RoomCodeSystemConfig;
  routingCosts?: {
    stairsMetersPerFloor: number;
    elevatorMetersPerWait: number;
  };
  reportIssueUrl?: string;
}

export interface ValidationIssue {
  code:
    | 'MISSING_SCALE'
    | 'DUPLICATE_CODE'
    | 'DISCONNECTED_NODE'
    | 'NON_POSITIVE_LENGTH'
    | 'MANUAL_LENGTH_DEVIATION'
    | 'SINGLE_FLOOR_CONNECTOR'
    | 'MISSING_DOCTOR_OFFICE'
    | 'INVALID_ROOM_CODE'
    | 'INVALID_REFERENCE';
  message: string;
  entityId?: string;
  floorId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
}

export function getFloorMetersPerPixel(floor: FloorData): number | null {
  if (!floor.scale || !floor.scale.p1 || !floor.scale.p2) {
    return null;
  }
  const dx = floor.scale.p2.x - floor.scale.p1.x;
  const dy = floor.scale.p2.y - floor.scale.p1.y;
  const pixelDist = Math.hypot(dx, dy);
  if (pixelDist <= 0 || !floor.scale.distanceMeters || floor.scale.distanceMeters <= 0) {
    return null;
  }
  return floor.scale.distanceMeters / pixelDist;
}

export function validateCampusData(
  data: CampusData,
  settings?: CampusSettings
): ValidationResult {
  const errors: ValidationIssue[] = [];

  const floorsById = new Map<string, FloorData>();
  const floorScales = new Map<string, number>();

  for (const floor of data.floors) {
    floorsById.set(floor.id, floor);
    const mpp = getFloorMetersPerPixel(floor);
    if (mpp === null) {
      errors.push({
        code: 'MISSING_SCALE',
        message: `الدور «${floor.name || floor.id}» لا يحتوي على مقياس رسم صالح (يجب تحديد نقطتين مختلفتين ومسافة موجبة بالمتر).`,
        entityId: floor.id,
        floorId: floor.id,
      });
    } else {
      floorScales.set(floor.id, mpp);
    }
  }

  const seenFacilityCodes = new Set<string>();
  const facilitiesByCode = new Map<string, FacilityData>();
  const nodesById = new Map<string, NodeData>();

  for (const node of data.nodes) {
    nodesById.set(node.id, node);
  }

  const roomRegex =
    settings?.roomCodeSystem?.enabled && settings.roomCodeSystem.pattern
      ? new RegExp(settings.roomCodeSystem.pattern)
      : null;

  for (const fac of data.facilities) {
    const normalizedCode = fac.code.trim().toUpperCase();
    if (seenFacilityCodes.has(normalizedCode)) {
      errors.push({
        code: 'DUPLICATE_CODE',
        message: `رمز المرفق «${fac.code}» مكرر أكثر من مرة؛ يجب أن يكون لكل مرفق رمز فريد.`,
        entityId: fac.code,
        floorId: fac.floorId,
      });
    }
    seenFacilityCodes.add(normalizedCode);
    facilitiesByCode.set(fac.code, fac);

    if (!nodesById.has(fac.nodeId)) {
      errors.push({
        code: 'INVALID_REFERENCE',
        message: `المرفق «${fac.code}» مرتبط بنقطة باب غير موجودة (${fac.nodeId}).`,
        entityId: fac.code,
        floorId: fac.floorId,
      });
    }

    if (roomRegex && (fac.type === 'room' || fac.type === 'office')) {
      const match = fac.code.match(roomRegex);
      if (!match) {
        errors.push({
          code: 'INVALID_ROOM_CODE',
          message: `رمز القاعة/المكتب «${fac.code}» لا يطابق نظام رموز القاعات المعتمد.`,
          entityId: fac.code,
          floorId: fac.floorId,
        });
      } else if (settings?.roomCodeSystem?.floorPrefixMap && match[1]) {
        const expectedFloor = settings.roomCodeSystem.floorPrefixMap[match[1]];
        if (expectedFloor && expectedFloor !== fac.floorId) {
          errors.push({
            code: 'INVALID_ROOM_CODE',
            message: `رمز القاعة/المكتب «${fac.code}» يدل على الدور «${expectedFloor}» لكنه مسجّل في الدور «${fac.floorId}».`,
            entityId: fac.code,
            floorId: fac.floorId,
          });
        }
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of data.nodes) {
    adjacency.set(node.id, new Set<string>());
  }

  for (const edge of data.edges) {
    const n1 = nodesById.get(edge.from);
    const n2 = nodesById.get(edge.to);

    if (!n1 || !n2) {
      errors.push({
        code: 'INVALID_REFERENCE',
        message: `الممر «${edge.id}» يربط بين نقطة غير موجودة (${edge.from} أو ${edge.to}).`,
        entityId: edge.id,
        floorId: edge.floorId,
      });
      continue;
    }

    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);

    const mpp = floorScales.get(edge.floorId);
    const pixelDist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
    const referenceComputed =
      mpp !== undefined && pixelDist > 0
        ? pixelDist * mpp
        : edge.computedLengthMeters;

    if (
      edge.computedLengthMeters <= 0 ||
      (edge.manualLengthMeters !== undefined && edge.manualLengthMeters <= 0) ||
      referenceComputed <= 0
    ) {
      errors.push({
        code: 'NON_POSITIVE_LENGTH',
        message: `الممر «${edge.id}» في الدور «${edge.floorId}» طوله صفري أو سالب، وهو غير مسموح.`,
        entityId: edge.id,
        floorId: edge.floorId,
      });
      continue;
    }

    if (edge.manualLengthMeters !== undefined) {
      const baseLen = edge.computedLengthMeters > 0 ? edge.computedLengthMeters : referenceComputed;
      const diffRatio = Math.abs(edge.manualLengthMeters - baseLen) / baseLen;
      if (diffRatio > 0.200001) {
        const pct = Math.round(diffRatio * 100);
        errors.push({
          code: 'MANUAL_LENGTH_DEVIATION',
          message: `الطول اليدوي للممر «${edge.id}» (${edge.manualLengthMeters} م) يختلف بنسبة ${pct}% عن الطول المحسوب (${baseLen.toFixed(1)} م)، والحد الأقصى المسموح هو 20%.`,
          entityId: edge.id,
          floorId: edge.floorId,
        });
      }
    }
  }

  for (const floor of data.floors) {
    const floorNodes = data.nodes.filter((n) => n.floorId === floor.id);
    if (floorNodes.length === 0) continue;

    const visited = new Set<string>();
    const startNode = floorNodes[0].id;
    const queue: string[] = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adjacency.get(curr);
      if (!neighbors) continue;
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    if (floorNodes.length > 1 && (adjacency.get(startNode)?.size ?? 0) === 0) {
      errors.push({
        code: 'DISCONNECTED_NODE',
        message: `النقطة «${startNode}» في الدور «${floor.name}» غير متصلة بأي ممر في الشبكة.`,
        entityId: startNode,
        floorId: floor.id,
      });
    }

    for (const node of floorNodes) {
      if (!visited.has(node.id)) {
        errors.push({
          code: 'DISCONNECTED_NODE',
          message: `النقطة «${node.id}» في الدور «${floor.name}» غير متصلة بباقي شبكة الممرات.`,
          entityId: node.id,
          floorId: floor.id,
        });
      }
    }
  }

  if (data.floors.length > 1) {
    const connectorFloors = new Map<string, Set<string>>();

    for (const fac of data.facilities) {
      if (fac.type === 'stairs' || fac.type === 'elevator') {
        const groupName = (fac.connectorGroup || fac.name || fac.code).trim();
        if (!connectorFloors.has(groupName)) {
          connectorFloors.set(groupName, new Set<string>());
        }
        connectorFloors.get(groupName)!.add(fac.floorId);
      }
    }

    for (const [groupName, fset] of connectorFloors.entries()) {
      if (fset.size < 2) {
        const onlyFloor = Array.from(fset)[0];
        errors.push({
          code: 'SINGLE_FLOOR_CONNECTOR',
          message: `الدرج أو المصعد «${groupName}» يظهر في دور واحد فقط (${onlyFloor}) ولا يربط بين دورين.`,
          entityId: groupName,
          floorId: onlyFloor,
        });
      }
    }
  }

  for (const doc of data.doctors) {
    if (!facilitiesByCode.has(doc.officeCode)) {
      errors.push({
        code: 'MISSING_DOCTOR_OFFICE',
        message: `الدكتور «${doc.name}» مرتبط بمكتب غير موجود في المرافق (${doc.officeCode}).`,
        entityId: doc.id,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
