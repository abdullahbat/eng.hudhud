import { describe, expect, it } from 'vitest';
import rawCampusData from '../../data/campus.json';
import rawSettings from '../../data/settings.json';
import { findShortestRoute, getTurnDirection, snapPointToCorridor } from '../router';
import { CampusData, CampusSettings } from '../validator';

const campusData = rawCampusData as unknown as CampusData;
const settings = rawSettings as unknown as CampusSettings;

describe('فحص محرك المسارات والشرح الكتابي (المرحلة 3)', () => {
  it('يحسب مساراً داخل نفس الدور بدقة وبالمسافة المحسوبة يدوياً من البيانات', () => {
    // مسار في الدور الأرضي من المدخل الرئيسي ENT-MAIN إلى القاعة G-08:
    // ENT-MAIN -> n-915-840 (3 م)
    // n-915-840 -> n-915-680 (16 م) -> n-915-525 (15.5 م) -> n-915-350 (17.5 م) = 49 م مستقيم
    // n-915-350 -> باب G-08 شرقاً (3 م)
    // المجموع اليدوي = 3 + 16 + 15.5 + 17.5 + 3 = 55 م بالضبط
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'ENT-MAIN' },
      'G-08',
      {},
      settings
    );
    expect(res.found).toBe(true);
    expect(res.segments.length).toBe(1);
    expect(res.totalDistanceMeters).toBe(55);
    expect(res.fullDescription).toContain('55 م');
    // لا يذكر يمين/يسار في أول خطوة
    expect(res.segments[0].stepsText[0]).not.toMatch(/انعطف (يميناً|يساراً)/);
  });

  it('يحسب مساراً يغيّر دورين عبر الدرج بدون جمع كلفة الدرج في المسافة المعروضة للطالب', () => {
    // من القاعة G-07 في الدور الأرضي (عند 915,210) إلى القاعة F2-07 في الدور الثاني (عند 915,210)
    // في الدور الأرضي: باب G-07 -> n-915-210 (3 م) -> n-915-350 (14 م) -> n-915-525 (17.5 م) -> STAIR-E-G (3 م) = 37.5 م
    // في الدور الثاني: STAIR-E-F2 -> n-915-525 (3 م) -> n-915-350 (17.5 م) -> n-915-210 (14 م) -> باب F2-07 (3 م) = 37.5 م
    // المجموع اليدوي للمشي الصافي (بدون كلفة الدرج 15×2=30) = 37.5 + 37.5 = 75 م بالضبط
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'G-07' },
      'F2-07',
      { preferElevator: false },
      settings
    );
    expect(res.found).toBe(true);
    expect(res.segments.length).toBe(2);
    expect(res.segments[0].connectorToNext?.type).toBe('stairs');
    expect(res.segments[0].connectorToNext?.name).toBe('درج-شرق');
    expect(res.totalDistanceMeters).toBe(75);
    expect(res.fullDescription).toContain('اصعد بـدرج-شرق إلى الدور الثاني، ثم اضغط التالي');
  });

  it('يلتزم بخيار «أفضّل المصعد» ويتجنب الدرج نهائياً عند الانتقال بين الأدوار', () => {
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'G-07' },
      'F2-07',
      { preferElevator: true },
      settings
    );
    expect(res.found).toBe(true);
    expect(res.segments.length).toBe(2);
    expect(res.segments[0].connectorToNext?.type).toBe('elevator');
    expect(res.segments[0].connectorToNext?.name).toBe('مصعد-1');
    expect(res.fullDescription).toContain('بالمصعد (مصعد-1)');
  });

  it('يتعامل بشكل صحيح عندما تكون البداية هي نفس الوجهة (المسافة = 0 م)', () => {
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'F1-03' },
      'F1-03',
      {},
      settings
    );
    expect(res.found).toBe(true);
    expect(res.totalDistanceMeters).toBe(0);
    expect(res.fullDescription).toContain('أنت بالفعل عند');
  });

  it('يرجع رسالة عربية واضحة عندما تكون الوجهة غير موجودة', () => {
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'G-01' },
      'UNKNOWN-999',
      {},
      settings
    );
    expect(res.found).toBe(false);
    expect(res.error).toContain('غير موجودة');
  });

  it('يكتشف الوجهة التي لا يوصل إليها أي طريق متصل', () => {
    const mutated: CampusData = JSON.parse(JSON.stringify(campusData));
    mutated.nodes.push({
      id: 'isolated-door-node',
      floorId: 'ground',
      x: 50,
      y: 50,
      kind: 'door',
      demo: true,
    });
    mutated.facilities.push({
      code: 'G-99',
      type: 'room',
      name: 'قاعة معزولة',
      floorId: 'ground',
      nodeId: 'isolated-door-node',
      demo: true,
    });
    const res = findShortestRoute(
      mutated,
      { type: 'facility', code: 'ENT-MAIN' },
      'G-99',
      {},
      settings
    );
    expect(res.found).toBe(false);
    expect(res.error).toContain('لا يوجد مسار متصل');
  });

  it('يحدد الانعطاف يميناً ويساراً بدقة مع مراعاة اتجاه محور y للأسفل في الصور', () => {
    // المشي شمالاً (للأعلى في الصورة: y يتناقص من 680 إلى 525) ثم الانعطاف غرباً (لليسار: x يتناقص من 915 إلى 675) -> انعطاف يساراً
    expect(
      getTurnDirection({ x: 915, y: 680 }, { x: 915, y: 525 }, { x: 675, y: 525 })
    ).toBe('left');

    // المشي غرباً (x يتناقص من 915 إلى 675 عند y=525) ثم الاتجاه شمالاً (للأعلى: y يتناقص إلى 350) -> انعطاف يميناً!
    expect(
      getTurnDirection({ x: 915, y: 525 }, { x: 675, y: 525 }, { x: 675, y: 350 })
    ).toBe('right');

    // فحص مسار فعلي فيه انعطاف يسار ثم يمين: من n-915-840 (ENT-MAIN) إلى المصلى PRAYER-G (عند 675, 495)
    // يخرج من ENT-MAIN (915,870) شمالاً إلى (915,525) ثم ينعطف يساراً غرباً إلى (675,525) ثم تكون غرفة المصلى على يمينه (675,495)
    const res = findShortestRoute(
      campusData,
      { type: 'facility', code: 'ENT-MAIN' },
      'PRAYER-G',
      {},
      settings
    );
    expect(res.found).toBe(true);
    expect(res.fullDescription).toContain('انعطف يساراً');
    expect(res.fullDescription).toContain('على يمينك');
  });

  it('يسقط نقطة النقر على الخريطة على أقرب ممر ويحسب المسار منها', () => {
    const snap = snapPointToCorridor(campusData, 'ground', 600, 540);
    expect(snap).not.toBeNull();
    expect(snap!.projectedPoint.y).toBe(525);
    expect(snap!.projectedPoint.x).toBe(600);

    const res = findShortestRoute(
      campusData,
      { type: 'point', floorId: 'ground', x: 600, y: 540 },
      'PRAYER-G',
      {},
      settings
    );
    expect(res.found).toBe(true);
    // من (600,525) إلى (675,525) = 7.5 م + 3 م لباب المصلى = 10.5 م -> تقرب إلى 11 م
    expect(res.totalDistanceMeters).toBe(11);
  });
});
