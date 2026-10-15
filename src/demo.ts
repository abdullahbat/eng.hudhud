export interface DemoTaggable {
  demo?: boolean;
}

export interface CampusDataSnapshot {
  floors?: DemoTaggable[];
  facilities?: DemoTaggable[];
  nodes?: DemoTaggable[];
  edges?: DemoTaggable[];
  landmarks?: DemoTaggable[];
  doctors?: DemoTaggable[];
}

export const DEMO_BANNER_TEXT = 'نسخة تجريبية: البيانات ليست حقيقية';

/**
 * يتحقق مما إذا كانت البيانات تحتوي على عنصر واحد على الأقل يحمل علامة demo: true
 */
export function hasDemoData(data: CampusDataSnapshot): boolean {
  const collections = [
    data.floors ?? [],
    data.facilities ?? [],
    data.nodes ?? [],
    data.edges ?? [],
    data.landmarks ?? [],
    data.doctors ?? [],
  ];
  return collections.some((items) => items.some((item) => item.demo === true));
}
