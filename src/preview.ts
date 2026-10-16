import campusData from '../data/campus.json';
import { DEMO_BANNER_TEXT, hasDemoData } from './demo';
import { createHoopoeElement } from './hoopoe';

export function initPreviewPage(doc: Document = document): void {
  const banner = doc.getElementById('demo-banner');
  if (banner && hasDemoData(campusData)) {
    banner.textContent = DEMO_BANNER_TEXT;
    banner.hidden = false;
  }

  const mountCard = (id: string, variant: 'calm' | 'vivid') => {
    const slot = doc.querySelector(`#${id} .slot`);
    if (slot) {
      slot.appendChild(createHoopoeElement({ size: 'large', variant }));
    }
  };

  mountCard('card-calm-light', 'calm');
  mountCard('card-calm-dark', 'calm');
  mountCard('card-vivid-light', 'vivid');
  mountCard('card-vivid-dark', 'vivid');

  const smallSlot = doc.getElementById('small-marker-slot');
  if (smallSlot) {
    smallSlot.appendChild(createHoopoeElement({ size: 'small', label: 'علامة الوجهة على الخريطة' }));
  }
}

if (typeof document !== 'undefined') {
  initPreviewPage(document);
}
