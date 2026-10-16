import { describe, expect, it } from 'vitest';
import { HOOPOE_SVG_PATH } from '../hoopoe';

describe('فحص هوية الهدهد (المرحلة 1)', () => {
  it('يكون حجم مسار SVG للهدهد خفيفاً وأقل من 15 كيلوبايت', () => {
    const byteLength = new TextEncoder().encode(HOOPOE_SVG_PATH).length;
    expect(byteLength).toBeGreaterThan(500);
    expect(byteLength).toBeLessThan(15 * 1024);
  });

  it('يبدأ مسار SVG وينتهي بشكل مغلق سليم', () => {
    expect(HOOPOE_SVG_PATH.startsWith('M ')).toBe(true);
    expect(HOOPOE_SVG_PATH.endsWith('Z')).toBe(true);
  });
});
