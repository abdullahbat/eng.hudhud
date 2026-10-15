import campusData from '../data/campus.json';
import { DEMO_BANNER_TEXT, hasDemoData } from './demo';
import { createHoopoeElement } from './hoopoe';

export function initApp(doc: Document = document): void {
  const banner = doc.getElementById('demo-banner');
  if (banner) {
    if (hasDemoData(campusData)) {
      banner.textContent = DEMO_BANNER_TEXT;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  const heroHoopoe = doc.getElementById('hero-hoopoe');
  if (heroHoopoe && heroHoopoe.childElementCount === 0) {
    heroHoopoe.appendChild(createHoopoeElement({ size: 'large', variant: 'calm' }));
  }
}

if (typeof document !== 'undefined') {
  initApp(document);
}
