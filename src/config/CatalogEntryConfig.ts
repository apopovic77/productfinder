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
  /**
   * How the grid groups this category, depth by depth — the way the B2B
   * shop lays it out (series/line, then model, then colour). Keys are
   * product attribute keys. The pivot engine follows this before scoring;
   * a level that does not split the products (one value, or one per
   * product) is skipped. Omit to leave the choice to scoring.
   */
  grouping?: string[];
};

// Shared grouping orders (owner decision 2026-08-23, from the pivot-tree audit)
const HELMETS = ['product_line', 'design_group', 'color_name'];          // 3SRS > design > colour
const GEAR = ['product_type', 'product_line', 'design_group', 'color_name']; // jersey/pants > ELEMENT > design > colour
const LINE_FIRST = ['product_line', 'design_group', 'color_name'];       // gloves, boots, goggles
const PROTECTION = ['body_part', 'product_line', 'color_name'];           // chest/knee > line > colour
const TYPE_COLOUR = ['product_type', 'color_name'];                        // jackets, accessories
const RAIN = ['design_group', 'color_name'];                                // product_type is one value here; jacket/pants live in the model name

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
      { id: 'mx-helmets', labels: label('MX HELMETS'), categories: ['Helmets MX'], targetGroup: 'Erwachsene', grouping: HELMETS },
      { id: 'goggles', labels: label('GOGGLES'), categories: ['Goggles'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'mx-gear', labels: label('MX GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Erwachsene', grouping: GEAR },
      { id: 'rainwear', labels: label('RAINWEAR'), categories: ['Rain Wear'], targetGroup: 'Erwachsene', grouping: RAIN },
      { id: 'gloves', labels: label('GLOVES'), categories: ['Gloves'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'boots', labels: label('BOOTS'), categories: ['Boots MX'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'protection', labels: label('PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Erwachsene', grouping: PROTECTION },
      { id: 'street-adventure-helmets', labels: label('STREET/ADVENTURE HELMETS'), categories: ['Helmets Street'], targetGroup: 'Erwachsene', grouping: HELMETS },
      { id: 'street-adventure-jackets-pants', labels: label('STREET/ADVENTURE JACKETS & PANTS'), categories: ['Jackets', 'ADV Pants'], targetGroup: 'Erwachsene', grouping: TYPE_COLOUR },
      { id: 'youth-helmets', labels: label('YOUTH HELMETS'), categories: ['Helmets MX'], targetGroup: 'Jugendliche', grouping: HELMETS },
      { id: 'youth-gear', labels: label('YOUTH GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Jugendliche', grouping: GEAR },
      { id: 'youth-goggles', labels: label('YOUTH GOGGLES'), categories: ['Goggles'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-gloves', labels: label('YOUTH GLOVES'), categories: ['Gloves'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-boots', labels: label('YOUTH BOOTS'), categories: ['Boots MX'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-protection', labels: label('YOUTH PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Jugendliche', grouping: PROTECTION },
      {
        id: 'accessories-leisure',
        labels: label('ACCESSORIES & LEISURE'),
        categories: ['Leisure Accessories', 'Casual Wear', 'Bags / Backpacks', 'Grips'],
        targetGroup: 'Erwachsene',
        grouping: TYPE_COLOUR,
      },
    ],
    mtb: [],
  },
};

export function getLocalizedLabel(labels: LocalizedLabel, locale: CatalogLocale): string {
  return labels[locale] ?? labels.en ?? Object.values(labels)[0] ?? '';
}

