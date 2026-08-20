export type CatalogLocale = 'de' | 'en' | string;

export type LocalizedLabel = Record<string, string>;

export type CatalogLandingMedia = {
  mode: 'logo' | 'image' | 'video';
  url?: string;
  storageId?: number;
  position?: string;
};

export type CatalogSportConfig = {
  id: string;
  labels: LocalizedLabel;
  sportValues: string[];
  enabled: boolean;
  comingSoon?: boolean;
};

export type CatalogCategoryConfig = {
  id: string;
  labels: LocalizedLabel;
  categories: string[];
  targetGroup: 'Erwachsene' | 'Jugendliche';
  banner?: CatalogLandingMedia;
};

export type CatalogEntrySelection = {
  sportId: string;
  categoryId: string;
};

export type CatalogEntryConfig = {
  year: number;
  landing: CatalogLandingMedia;
  sports: CatalogSportConfig[];
  categoriesBySport: Record<string, CatalogCategoryConfig[]>;
};

const label = (value: string): LocalizedLabel => ({ de: value, en: value });

export const CATALOG_ENTRY_CONFIG: CatalogEntryConfig = {
  year: 2027,
  // Alex' finale Medienwahl bleibt ein einzelner Config-Wechsel. Solange kein
  // freigegebenes GSG-Asset vorliegt, rendert die Landing das typografische
  // Gravity-Sports-Group-Logo und benötigt weder Platzhalterdatei noch URL.
  landing: { mode: 'logo' },
  sports: [
    {
      id: 'moto',
      labels: label('MOTO'),
      sportValues: ['MX'],
      enabled: true,
    },
    {
      id: 'mtb',
      labels: label('MTB'),
      sportValues: ['MTB'],
      enabled: false,
      comingSoon: true,
    },
  ],
  categoriesBySport: {
    moto: [
      { id: 'mx-helmets', labels: label('MX HELMETS'), categories: ['Helmets MX'], targetGroup: 'Erwachsene' },
      { id: 'goggles', labels: label('GOGGLES'), categories: ['Goggles'], targetGroup: 'Erwachsene' },
      { id: 'mx-gear', labels: label('MX GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Erwachsene' },
      { id: 'rainwear', labels: label('RAINWEAR'), categories: ['Rain Wear'], targetGroup: 'Erwachsene' },
      { id: 'gloves', labels: label('GLOVES'), categories: ['Gloves'], targetGroup: 'Erwachsene' },
      { id: 'boots', labels: label('BOOTS'), categories: ['Boots MX'], targetGroup: 'Erwachsene' },
      { id: 'protection', labels: label('PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Erwachsene' },
      { id: 'street-adventure-helmets', labels: label('STREET/ADVENTURE HELMETS'), categories: ['Helmets Street'], targetGroup: 'Erwachsene' },
      { id: 'street-adventure-jackets-pants', labels: label('STREET/ADVENTURE JACKETS & PANTS'), categories: ['Jackets', 'ADV Pants'], targetGroup: 'Erwachsene' },
      { id: 'youth-helmets', labels: label('YOUTH HELMETS'), categories: ['Helmets MX'], targetGroup: 'Jugendliche' },
      { id: 'youth-gear', labels: label('YOUTH GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Jugendliche' },
      { id: 'youth-goggles', labels: label('YOUTH GOGGLES'), categories: ['Goggles'], targetGroup: 'Jugendliche' },
      { id: 'youth-gloves', labels: label('YOUTH GLOVES'), categories: ['Gloves'], targetGroup: 'Jugendliche' },
      { id: 'youth-boots', labels: label('YOUTH BOOTS'), categories: ['Boots MX'], targetGroup: 'Jugendliche' },
      { id: 'youth-protection', labels: label('YOUTH PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Jugendliche' },
      {
        id: 'accessories-leisure',
        labels: label('ACCESSORIES & LEISURE'),
        categories: ['Leisure Accessories', 'Casual Wear', 'Bags / Backpacks', 'Grips'],
        targetGroup: 'Erwachsene',
      },
    ],
    mtb: [],
  },
};

export function getLocalizedLabel(labels: LocalizedLabel, locale: CatalogLocale): string {
  return labels[locale] ?? labels.en ?? Object.values(labels)[0] ?? '';
}

