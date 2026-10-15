import { describe, expect, it } from 'vitest';
import campusData from '../../data/campus.json';
import { DEMO_BANNER_TEXT, hasDemoData } from '../demo';

describe('فحص التأسيس والبيانات التجريبية (المرحلة 0)', () => {
  it('يكتشف وجود علامة demo: true في البيانات التجريبية الحالية', () => {
    expect(hasDemoData(campusData)).toBe(true);
  });

  it('يعيد false عندما تخلو جميع القوائم من علامة demo: true', () => {
    const realData = {
      floors: [{ demo: false }],
      facilities: [{}],
    };
    expect(hasDemoData(realData)).toBe(false);
  });

  it('يتطابق نص شريط النسخة التجريبية مع النص المطلوب في CLAUDE.md', () => {
    expect(DEMO_BANNER_TEXT).toBe('نسخة تجريبية: البيانات ليست حقيقية');
  });
});
