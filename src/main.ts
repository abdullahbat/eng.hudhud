import campusData from '../data/campus.json';
import { DEMO_BANNER_TEXT, hasDemoData } from './demo';

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
}

if (typeof document !== 'undefined') {
  initApp(document);
}
