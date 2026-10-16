/**
 * مسار ظل الهدهد المصمت (أقل من 3 كيلوبايت) مُستخرج بتتبّع الحواف من materials/hoopoe.png
 */
export const HOOPOE_SVG_PATH = "M 30.7 71.9 L 30.9 72.5 L 31.4 72.5 L 34.4 71.1 L 35.0 71.1 L 39.6 69.3 L 45.3 67.8 L 47.3 67.6 L 51.6 66.6 L 54.9 66.4 L 55.1 66.2 L 58.6 66.2 L 58.8 66.0 L 64.3 66.2 L 66.2 66.6 L 68.6 68.2 L 70.9 70.7 L 72.3 74.2 L 72.3 79.5 L 72.1 79.7 L 72.1 81.2 L 71.3 86.3 L 71.3 88.5 L 71.1 88.7 L 71.1 96.7 L 72.1 102.3 L 73.6 107.2 L 76.2 112.3 L 79.9 117.4 L 83.2 120.7 L 87.1 123.8 L 91.8 126.8 L 93.6 127.5 L 93.9 127.9 L 95.5 131.6 L 97.9 135.2 L 97.9 136.1 L 97.1 138.1 L 97.1 138.7 L 92.0 153.9 L 91.2 154.5 L 86.9 154.5 L 86.7 154.7 L 81.8 155.1 L 80.9 155.9 L 80.7 156.6 L 80.9 157.4 L 81.4 158.0 L 82.6 158.2 L 84.4 157.8 L 89.3 157.4 L 90.2 158.6 L 90.8 158.8 L 95.3 158.4 L 95.5 158.2 L 98.2 158.2 L 98.4 158.0 L 103.7 158.0 L 103.9 158.2 L 106.1 158.2 L 108.2 158.6 L 110.7 158.4 L 111.3 157.6 L 111.3 156.2 L 110.7 155.7 L 108.4 155.3 L 104.3 155.1 L 104.1 154.9 L 106.1 148.0 L 106.4 147.5 L 106.4 146.9 L 109.8 136.7 L 110.0 132.8 L 110.2 132.6 L 112.9 133.2 L 116.2 133.4 L 116.4 133.6 L 119.3 133.6 L 119.5 133.8 L 126.8 133.6 L 144.9 150.6 L 147.7 152.5 L 151.0 154.3 L 154.1 155.3 L 156.6 155.7 L 166.0 155.5 L 168.0 155.1 L 169.1 154.5 L 169.3 153.7 L 168.6 152.7 L 165.0 150.0 L 143.6 130.9 L 144.3 130.7 L 149.0 131.6 L 151.4 131.6 L 152.1 131.1 L 152.1 129.9 L 151.8 129.3 L 122.1 101.8 L 100.0 82.0 L 98.2 80.1 L 96.1 76.8 L 94.7 73.6 L 94.1 71.5 L 93.6 67.4 L 93.4 63.1 L 97.5 61.5 L 102.9 60.0 L 104.3 59.2 L 105.1 58.4 L 106.2 56.4 L 106.2 55.1 L 105.7 54.5 L 101.0 55.1 L 97.7 55.9 L 97.1 55.7 L 100.0 53.9 L 107.6 50.2 L 108.8 49.0 L 109.6 47.5 L 109.6 45.3 L 109.2 44.7 L 108.8 44.5 L 107.8 44.7 L 104.9 46.1 L 101.2 47.3 L 100.2 47.9 L 92.2 50.8 L 92.0 50.6 L 96.3 47.1 L 97.7 45.5 L 98.0 44.3 L 98.0 43.2 L 97.7 42.0 L 97.1 41.4 L 96.3 41.4 L 94.5 42.4 L 82.2 50.4 L 81.8 50.2 L 83.6 47.7 L 83.8 45.7 L 83.4 44.7 L 82.4 43.8 L 81.6 43.8 L 79.3 45.7 L 68.4 56.2 L 66.2 59.8 L 60.0 60.4 L 57.6 60.9 L 55.5 61.1 L 50.4 62.3 L 44.1 64.3 L 37.1 67.4 L 32.0 70.5 Z M 102.3 131.1 L 106.2 137.3 L 105.7 138.5 L 104.7 142.4 L 100.8 154.5 L 100.4 154.9 L 95.7 154.7 L 95.1 154.3 L 95.9 152.5 L 100.8 137.3 L 101.2 136.7 L 101.8 134.2 L 101.8 131.2 Z";

export type HoopoeSize = 'large' | 'small';
export type SparkVariant = 'calm' | 'vivid' | 'none';

export interface HoopoeOptions {
  size?: HoopoeSize;
  variant?: SparkVariant;
  label?: string;
}

/**
 * ينشئ عنصر الهدهد القابل لإعادة الاستخدام:
 * - large: كبير للواجهة الرئيسية مع حركات النقر والالتفات والصواعق (7 ثوانٍ)
 * - small: صغير وثابت لعلامة الوجهة على الخريطة بدون حركة
 */
export function createHoopoeElement(options: HoopoeOptions = {}): HTMLElement {
  const size: HoopoeSize = options.size ?? 'large';
  const variant: SparkVariant = size === 'small' ? 'none' : (options.variant ?? 'calm');
  const label = options.label ?? (size === 'small' ? 'علامة الوجهة' : 'شعار هدهد الهندسة');

  const wrapper = document.createElement('div');
  wrapper.className = `hoopoe-widget hoopoe-${size} hoopoe-sparks-${variant}`;
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', label);

  const sparksMarkup =
    variant === 'none'
      ? ''
      : `
      <svg class="hoopoe-sparks" viewBox="0 0 200 200" aria-hidden="true">
        <path class="spark spark-top" d="M 98 4 L 88 24 L 103 26 L 91 48" />
        <path class="spark spark-right" d="M 188 58 L 164 70 L 172 78 L 146 92" />
        <path class="spark spark-left" d="M 12 44 L 36 56 L 28 64 L 54 74" />
        <path class="spark spark-side" d="M 176 116 L 154 122 L 160 130 L 138 138" />
      </svg>`;

  wrapper.innerHTML = `
    <div class="hoopoe-stage">
      ${sparksMarkup}
      <div class="hoopoe-turn-layer">
        <div class="hoopoe-peck-layer">
          <svg class="hoopoe-bird-svg" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="${HOOPOE_SVG_PATH}" />
          </svg>
        </div>
      </div>
    </div>
  `;

  return wrapper;
}
