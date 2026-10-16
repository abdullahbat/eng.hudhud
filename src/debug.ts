import rawCampusData from '../data/campus.json';
import rawSettings from '../data/settings.json';
import { DEMO_BANNER_TEXT, hasDemoData } from './demo';
import { HOOPOE_SVG_PATH } from './hoopoe';
import {
  FloorRouteSegment,
  RouteResult,
  RouteStartInput,
  findShortestRoute,
} from './router';
import { CampusData, CampusSettings } from './validator';

const campusData = rawCampusData as unknown as CampusData;
const settings = rawSettings as unknown as CampusSettings;

export function initDebugPage(doc: Document = document): void {
  const banner = doc.getElementById('demo-banner');
  if (banner && hasDemoData(campusData)) {
    banner.textContent = DEMO_BANNER_TEXT;
    banner.hidden = false;
  }

  const startSelect = doc.getElementById('start-select') as HTMLSelectElement | null;
  const destSelect = doc.getElementById('dest-select') as HTMLSelectElement | null;
  const preferElevatorCheckbox = doc.getElementById('prefer-elevator') as HTMLInputElement | null;
  const calcBtn = doc.getElementById('calc-btn');
  const totalBadge = doc.getElementById('total-distance-badge');
  const fullDesc = doc.getElementById('full-description-text');
  const segmentTabs = doc.getElementById('segment-tabs');
  const floorImg = doc.getElementById('debug-floor-img') as HTMLImageElement | null;
  const routeSvg = doc.getElementById('debug-route-svg') as SVGSVGElement | null;
  const stepsList = doc.getElementById('segment-steps-list');

  if (!startSelect || !destSelect || !floorImg || !routeSvg) return;

  // تعبئة خيارات البداية (المعالم + المرافق)
  const lmGroup = doc.createElement('optgroup');
  lmGroup.label = 'المعالم البارزة';
  for (const lm of campusData.landmarks) {
    const opt = doc.createElement('option');
    opt.value = `landmark:${lm.id}`;
    opt.textContent = `📍 ${lm.name}`;
    lmGroup.appendChild(opt);
  }
  startSelect.appendChild(lmGroup);

  const facGroupStart = doc.createElement('optgroup');
  facGroupStart.label = 'القاعات والمرافق والمداخل';
  for (const fac of campusData.facilities) {
    const opt = doc.createElement('option');
    opt.value = `facility:${fac.code}`;
    opt.textContent = `${fac.code} — ${fac.name}`;
    facGroupStart.appendChild(opt);
  }
  startSelect.appendChild(facGroupStart);

  // تعبئة خيارات الوجهة (المرافق والدكاترة)
  const docGroup = doc.createElement('optgroup');
  docGroup.label = 'مكاتب أعضاء هيئة التدريس';
  for (const d of campusData.doctors) {
    const opt = doc.createElement('option');
    opt.value = d.officeCode;
    opt.textContent = `👨‍🏫 ${d.name} (${d.officeCode})`;
    docGroup.appendChild(opt);
  }
  destSelect.appendChild(docGroup);

  const facGroupDest = doc.createElement('optgroup');
  facGroupDest.label = 'جميع القاعات والمرافق';
  for (const fac of campusData.facilities) {
    const opt = doc.createElement('option');
    opt.value = fac.code;
    opt.textContent = `${fac.code} — ${fac.name}`;
    facGroupDest.appendChild(opt);
  }
  destSelect.appendChild(facGroupDest);

  // قيم افتراضية: من البوابة الرئيسية إلى مكتب دكتور في الدور الثاني
  startSelect.value = 'facility:ENT-MAIN';
  destSelect.value = 'F2-09';

  let customPointStart: RouteStartInput | null = null;
  let currentResult: RouteResult | null = null;
  let activeSegIndex = 0;

  const renderSegment = (seg: FloorRouteSegment, isLastSegment: boolean) => {
    const floor = campusData.floors.find((f) => f.id === seg.floorId);
    if (floor) {
      floorImg.src = `./${floor.mapImage}`;
      routeSvg.setAttribute('viewBox', `0 0 ${floor.width} ${floor.height}`);
    }

    routeSvg.innerHTML = '';

    if (seg.points.length >= 2) {
      const ptsAttr = seg.points.map((p) => `${p.x},${p.y}`).join(' ');
      const polyline = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('points', ptsAttr);
      polyline.setAttribute('fill', 'none');
      polyline.setAttribute('stroke', '#f59e0b');
      polyline.setAttribute('stroke-width', '8');
      polyline.setAttribute('stroke-linecap', 'round');
      polyline.setAttribute('stroke-linejoin', 'round');
      routeSvg.appendChild(polyline);
    }

    // كتابة المسافة على كل مقطع مستقيم
    for (const sSeg of seg.straightSegments) {
      const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(sSeg.midPoint.x - 24));
      rect.setAttribute('y', String(sSeg.midPoint.y - 12));
      rect.setAttribute('width', '48');
      rect.setAttribute('height', '24');
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', '#0f172a');
      rect.setAttribute('stroke', '#f59e0b');
      rect.setAttribute('stroke-width', '1.5');

      const txt = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', String(sSeg.midPoint.x));
      txt.setAttribute('y', String(sSeg.midPoint.y + 5));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#ffffff');
      txt.setAttribute('font-size', '13');
      txt.setAttribute('font-weight', 'bold');
      txt.textContent = `${sSeg.distanceMeters} م`;

      g.appendChild(rect);
      g.appendChild(txt);
      routeSvg.appendChild(g);
    }

    // نقطة البداية
    if (seg.points.length > 0) {
      const pStart = seg.points[0];
      const startCircle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      startCircle.setAttribute('cx', String(pStart.x));
      startCircle.setAttribute('cy', String(pStart.y));
      startCircle.setAttribute('r', '10');
      startCircle.setAttribute('fill', '#10b981');
      startCircle.setAttribute('stroke', '#ffffff');
      startCircle.setAttribute('stroke-width', '3');
      routeSvg.appendChild(startCircle);

      // الهدهد الصغير المصمت عند الوجهة النهائية (أو دائرة الدرج/المصعد عند نهاية الدور الأول)
      const pEnd = seg.points[seg.points.length - 1];
      if (isLastSegment) {
        const birdGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
        birdGroup.setAttribute(
          'transform',
          `translate(${pEnd.x - 22}, ${pEnd.y - 38}) scale(0.22)`
        );
        const bgCircle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bgCircle.setAttribute('cx', '100');
        bgCircle.setAttribute('cy', '100');
        bgCircle.setAttribute('r', '95');
        bgCircle.setAttribute('fill', '#fef3c7');
        bgCircle.setAttribute('stroke', '#d97706');
        bgCircle.setAttribute('stroke-width', '12');

        const birdPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        birdPath.setAttribute('fill-rule', 'evenodd');
        birdPath.setAttribute('d', HOOPOE_SVG_PATH);
        birdPath.setAttribute('fill', '#0f172a');

        birdGroup.appendChild(bgCircle);
        birdGroup.appendChild(birdPath);
        routeSvg.appendChild(birdGroup);
      } else {
        const connCircle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        connCircle.setAttribute('cx', String(pEnd.x));
        connCircle.setAttribute('cy', String(pEnd.y));
        connCircle.setAttribute('r', '11');
        connCircle.setAttribute('fill', '#0284c7');
        connCircle.setAttribute('stroke', '#ffffff');
        connCircle.setAttribute('stroke-width', '3');
        routeSvg.appendChild(connCircle);
      }
    }

    if (stepsList) {
      stepsList.innerHTML = '';
      for (const st of seg.stepsText) {
        const li = doc.createElement('li');
        li.textContent = st;
        stepsList.appendChild(li);
      }
    }
  };

  const renderCurrentRoute = () => {
    if (!currentResult || !totalBadge || !fullDesc || !segmentTabs) return;
    if (!currentResult.found) {
      totalBadge.textContent = 'تعذّر إيجاد المسار';
      fullDesc.textContent = currentResult.error ?? '';
      segmentTabs.innerHTML = '';
      return;
    }

    totalBadge.textContent = `المسافة الكلية: حوالي ${currentResult.totalDistanceMeters} م`;
    fullDesc.textContent = currentResult.fullDescription;

    segmentTabs.innerHTML = '';
    currentResult.segments.forEach((seg, idx) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `debug-tab-btn ${idx === activeSegIndex ? 'active' : ''}`;
      btn.textContent = `${idx + 1}. ${seg.floorName} (${seg.distanceMeters} م)`;
      btn.addEventListener('click', () => {
        activeSegIndex = idx;
        renderCurrentRoute();
      });
      segmentTabs.appendChild(btn);
    });

    if (currentResult.segments.length > 1 && activeSegIndex < currentResult.segments.length - 1) {
      const nextBtn = doc.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'debug-tab-btn next-floor-btn';
      nextBtn.textContent = 'التالي: الدور الجديد ⬅';
      nextBtn.addEventListener('click', () => {
        activeSegIndex++;
        renderCurrentRoute();
      });
      segmentTabs.appendChild(nextBtn);
    }

    const activeSeg = currentResult.segments[activeSegIndex];
    if (activeSeg) {
      renderSegment(activeSeg, activeSegIndex === currentResult.segments.length - 1);
    }
  };

  const computeAndRender = () => {
    let startInput: RouteStartInput;
    if (customPointStart) {
      startInput = customPointStart;
    } else {
      const rawVal = startSelect.value;
      const [kind, idOrCode] = rawVal.split(':');
      startInput =
        kind === 'landmark'
          ? { type: 'landmark', id: idOrCode }
          : { type: 'facility', code: idOrCode };
    }

    currentResult = findShortestRoute(
      campusData,
      startInput,
      destSelect.value,
      { preferElevator: preferElevatorCheckbox?.checked ?? false },
      settings
    );
    activeSegIndex = 0;
    renderCurrentRoute();
  };

  startSelect.addEventListener('change', () => {
    customPointStart = null;
    computeAndRender();
  });
  destSelect.addEventListener('change', () => computeAndRender());
  preferElevatorCheckbox?.addEventListener('change', () => computeAndRender());
  calcBtn?.addEventListener('click', () => computeAndRender());

  // النقر على الخريطة لتعيين نقطة بداية مخصصة وإسقاطها على أقرب ممر
  routeSvg.addEventListener('click', (ev: MouseEvent) => {
    const rect = routeSvg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const activeSeg = currentResult?.segments[activeSegIndex];
    const floorId = activeSeg?.floorId ?? 'ground';
    const x = Math.round(((ev.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((ev.clientY - rect.top) / rect.height) * 1000);
    customPointStart = { type: 'point', floorId, x, y };
    computeAndRender();
  });

  computeAndRender();
}

if (typeof document !== 'undefined') {
  initDebugPage(document);
}
