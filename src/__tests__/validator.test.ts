import { describe, expect, it } from 'vitest';
import rawCampusData from '../../data/campus.json';
import rawSettings from '../../data/settings.json';
import { CampusData, CampusSettings, validateCampusData } from '../validator';

const campusData = rawCampusData as unknown as CampusData;
const settings = rawSettings as unknown as CampusSettings;

function cloneCampus(): CampusData {
  return JSON.parse(JSON.stringify(campusData)) as CampusData;
}

describe('فحص صيغة البيانات والكلية الوهمية وسكربت التحقق (المرحلة 2)', () => {
  it('تنجح بيانات الكلية الوهمية الكاملة (3 أدوار، قاعات، درج، مصعد، معالم، دكاترة) في جميع فحوصات التحقق', () => {
    const res = validateCampusData(campusData, settings);
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
    expect(campusData.floors.length).toBe(3);
    expect(campusData.landmarks.length).toBeGreaterThanOrEqual(5);
    expect(campusData.doctors.length).toBeGreaterThanOrEqual(6);
  });

  it('يرفض رمز مرفق مكرر برسالة عربية واضحة', () => {
    const mutated = cloneCampus();
    mutated.facilities.push({
      ...mutated.facilities[0],
      name: 'قاعة مكررة للتجربة',
    });
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_CODE' && e.message.includes('مكرر'))).toBe(true);
  });

  it('يرفض نقطة غير متصلة بباقي الشبكة في الدور', () => {
    const mutated = cloneCampus();
    mutated.nodes.push({
      id: 'isolated-node-99',
      floorId: 'ground',
      x: 300,
      y: 300,
      kind: 'junction',
      demo: true,
    });
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === 'DISCONNECTED_NODE' && e.entityId === 'isolated-node-99'
      )
    ).toBe(true);
  });

  it('يرفض ممراً طوله صفري أو سالب', () => {
    const mutated = cloneCampus();
    mutated.edges[0].manualLengthMeters = 0;
    const resZero = validateCampusData(mutated, settings);
    expect(resZero.valid).toBe(false);
    expect(resZero.errors.some((e) => e.code === 'NON_POSITIVE_LENGTH')).toBe(true);

    mutated.edges[0].manualLengthMeters = -5;
    const resNeg = validateCampusData(mutated, settings);
    expect(resNeg.valid).toBe(false);
    expect(resNeg.errors.some((e) => e.code === 'NON_POSITIVE_LENGTH')).toBe(true);
  });

  it('يرفض طولاً يدوياً يختلف عن الطول المحسوب بأكثر من 20%', () => {
    const mutated = cloneCampus();
    mutated.edges[0].manualLengthMeters = 25;
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === 'MANUAL_LENGTH_DEVIATION' && e.message.includes('20%')
      )
    ).toBe(true);
  });

  it('يرفض درجاً أو مصعداً يظهر في دور واحد فقط (غير مربوط)', () => {
    const mutated = cloneCampus();
    mutated.facilities.push({
      code: 'STAIR-LONELY',
      type: 'stairs',
      name: 'درج-منعزل',
      floorId: 'ground',
      nodeId: 'ground-h-150',
      connectorGroup: 'درج-منعزل',
      demo: true,
    });
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === 'SINGLE_FLOOR_CONNECTOR' && e.entityId === 'درج-منعزل'
      )
    ).toBe(true);
  });

  it('يرفض دوراً بلا مقياس رسم صالح', () => {
    const mutated = cloneCampus();
    delete mutated.floors[0].scale;
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'MISSING_SCALE')).toBe(true);
  });

  it('يرفض دكتوراً مكتبه غير موجود في قائمة المرافق', () => {
    const mutated = cloneCampus();
    mutated.doctors.push({
      id: 'doc-99',
      name: 'د. تجريبي بدون مكتب',
      officeCode: 'G-99',
      demo: true,
    });
    const res = validateCampusData(mutated, settings);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some(
        (e) => e.code === 'MISSING_DOCTOR_OFFICE' && e.message.includes('G-99')
      )
    ).toBe(true);
  });
});
