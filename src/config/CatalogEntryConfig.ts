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
  banner?: CatalogLandingMedia;
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
const HELMETS = ['product_line', 'design_group', 'color_base', 'color_name']; // 3SRS > design > base colour > colour
const GEAR = ['product_type', 'product_line', 'design_group', 'color_base', 'color_name']; // jersey/pants > ELEMENT > design > base colour > colour
const LINE_FIRST = ['product_line', 'design_group', 'color_base', 'color_name']; // gloves, boots, goggles
const PROTECTION = ['body_part', 'product_line', 'color_base', 'color_name']; // chest/knee > line > base colour > colour
const TYPE_COLOUR = ['product_type', 'color_base', 'color_name'];            // jackets, accessories
const RAIN = ['design_group', 'color_base', 'color_name'];                                // product_type is one value here; jacket/pants live in the model name

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
      banner: { mode: 'image', storageId: 17577 },
    },
    {
      id: 'mtb',
      labels: label('MTB'),
      sportValues: ['MTB'],
      enabled: true,
      banner: { mode: 'image', storageId: 15344 },
    },
  ],
  categoriesBySport: {
    moto: [
      { id: 'mx-helmets', banner: { mode: 'image', storageId: 10435 }, labels: label('MX HELMETS'), categories: ['Helmets MX'], targetGroup: 'Erwachsene', grouping: HELMETS },
      { id: 'goggles', banner: { mode: 'image', storageId: 9970 }, labels: label('GOGGLES'), categories: ['Goggles'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'mx-gear', banner: { mode: 'image', storageId: 17772 }, labels: label('MX GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Erwachsene', grouping: GEAR },
      { id: 'rainwear', banner: { mode: 'image', storageId: 16355 }, labels: label('RAINWEAR'), categories: ['Rain Wear'], targetGroup: 'Erwachsene', grouping: RAIN },
      { id: 'gloves', banner: { mode: 'image', storageId: 13798 }, labels: label('GLOVES'), categories: ['Gloves'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'boots', banner: { mode: 'image', storageId: 11767 }, labels: label('BOOTS'), categories: ['Boots MX'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'protection', banner: { mode: 'image', storageId: 10916 }, labels: label('PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Erwachsene', grouping: PROTECTION },
      { id: 'street-adventure-helmets', banner: { mode: 'image', storageId: 18556 }, labels: label('STREET/ADVENTURE HELMETS'), categories: ['Helmets Street'], targetGroup: 'Erwachsene', grouping: HELMETS },
      { id: 'street-adventure-jackets-pants', banner: { mode: 'image', storageId: 18695 }, labels: label('STREET/ADVENTURE JACKETS & PANTS'), categories: ['Jackets', 'ADV Pants'], targetGroup: 'Erwachsene', grouping: TYPE_COLOUR },
      { id: 'youth-helmets', banner: { mode: 'image', storageId: 17684 }, labels: label('YOUTH HELMETS'), categories: ['Helmets MX'], targetGroup: 'Jugendliche', grouping: HELMETS },
      { id: 'youth-gear', banner: { mode: 'image', storageId: 17967 }, labels: label('YOUTH GEAR'), categories: ['Jerseys Offroad', 'Pants MX'], targetGroup: 'Jugendliche', grouping: GEAR },
      { id: 'youth-goggles', banner: { mode: 'image', storageId: 17698 }, labels: label('YOUTH GOGGLES'), categories: ['Goggles'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-gloves', banner: { mode: 'image', storageId: 17969 }, labels: label('YOUTH GLOVES'), categories: ['Gloves'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-boots', banner: { mode: 'image', storageId: 17686 }, labels: label('YOUTH BOOTS'), categories: ['Boots MX'], targetGroup: 'Jugendliche', grouping: LINE_FIRST },
      { id: 'youth-protection', banner: { mode: 'image', storageId: 18009 }, labels: label('YOUTH PROTECTION'), categories: ['Protection MX', 'Protection MTB'], targetGroup: 'Jugendliche', grouping: PROTECTION },
      {
        id: 'accessories-leisure',
        banner: { mode: 'image', storageId: 15480 },
        labels: label('ACCESSORIES & LEISURE'),
        categories: ['Leisure Accessories', 'Casual Wear', 'Bags / Backpacks', 'Grips'],
        targetGroup: 'Erwachsene',
        grouping: TYPE_COLOUR,
      },
    ],
    mtb: [
      { id: 'mtb-helmets', banner: { mode: 'image', storageId: 15962 }, labels: label('MTB HELMETS'), categories: ['Helmets MTB Full Face', 'Helme MTB Open Face'], targetGroup: 'Erwachsene', grouping: HELMETS },
      { id: 'mtb-gear', banner: { mode: 'image', storageId: 17053 }, labels: label('MTB GEAR'), categories: ['Jerseys MTB', 'Pants/ Shorts MTB'], targetGroup: 'Erwachsene', grouping: GEAR },
      { id: 'mtb-goggles', banner: { mode: 'image', storageId: 14971 }, labels: label('GOGGLES'), categories: ['Goggles'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'mtb-gloves', banner: { mode: 'image', storageId: 15847 }, labels: label('GLOVES'), categories: ['Gloves'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'mtb-shoes', banner: { mode: 'image', storageId: 15811 }, labels: label('SHOES'), categories: ['Shoes'], targetGroup: 'Erwachsene', grouping: LINE_FIRST },
      { id: 'mtb-protection', banner: { mode: 'image', storageId: 15316 }, labels: label('PROTECTION'), categories: ['Protection MTB', 'Protection MX'], targetGroup: 'Erwachsene', grouping: PROTECTION },
      { id: 'mtb-youth-helmets', banner: { mode: 'image', storageId: 17829 }, labels: label('YOUTH HELMETS'), categories: ['Helmets MTB Full Face', 'Helme MTB Open Face'], targetGroup: 'Jugendliche', grouping: HELMETS },
      { id: 'mtb-youth-gear', banner: { mode: 'image', storageId: 14432 }, labels: label('YOUTH GEAR'), categories: ['Jerseys MTB', 'Pants/ Shorts MTB'], targetGroup: 'Jugendliche', grouping: GEAR },
      {
        id: 'mtb-accessories-leisure',
        banner: { mode: 'image', storageId: 15480 },
        labels: label('ACCESSORIES & LEISURE'),
        categories: ['Leisure Accessories', 'Casual Wear', 'Bags / Backpacks', 'Grips'],
        targetGroup: 'Erwachsene',
        grouping: TYPE_COLOUR,
      },
    ],
  },
};

export function getLocalizedLabel(labels: LocalizedLabel, locale: CatalogLocale): string {
  return labels[locale] ?? labels.en ?? Object.values(labels)[0] ?? '';
}

