export type CatalogLocale = 'de' | 'en' | string;

export type LocalizedLabel = Record<string, string>;

export type CatalogLandingMedia = {
  mode: 'logo' | 'image' | 'video';
  url?: string;
  storageId?: number;
  position?: string;
  /** 'contain' fuer freigestellte Produktbilder auf dunkler Kachel, 'cover' fuer Fotos */
  fit?: 'cover' | 'contain';
};

export type CatalogSportConfig = {
  id: string;
  labels: LocalizedLabel;
  sportValues: string[];
  enabled: boolean;
  comingSoon?: boolean;
  /** Markenbezogene Mood-Shots; `banner` bleibt der Fallback für offene/unbekannte Marken. */
  bannersByBrand?: Record<string, CatalogLandingMedia>;
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
const RAIN = ['garment_type', 'design_group', 'color_base', 'color_name'];               // jacket/pants derived from the model name (garment_type)

export type CatalogEntrySelection = {
  sportId: string;
  /** null = Kategorie-Stufe wurde nicht als Gate durchlaufen (Flow-Variante) */
  categoryId: string | null;
};

/**
 * Geführter Einstiegs-Flow, generisch konfigurierbar (owner 2026-08-25):
 * Welche Taxonomie-Stufen werden als grafische Gates präsentiert, welche
 * fallen direkt in den Finder? Eine nicht gelistete Stufe wird übersprungen —
 * 'brand' übersprungen heißt: alle Marken laden, Marke wird In-App-Dimension.
 * Auswahl per URL (?flow=<id>), Default ist die erste Variante.
 */
export type CatalogGateId = 'brand' | 'sport' | 'category';

export type CatalogFlowVariant = {
  id: string;
  gates: CatalogGateId[];
  description: string;
  /**
   * Smarte Gates (Default an): Jede Gate-Stufe zieht dieselbe Entscheidung
   * wie eine Pivot-Aktion im Canvas — eine Stufe ohne echte Wahl (nur eine
   * belegte Option) wird automatisch übersprungen, und faellt die
   * Produktmenge unter die Hero-Schwelle, geht es direkt in den Finder,
   * wo die Engine grouped/hero waehlt, statt eine Kachelwand mit
   * 'Nicht verfuegbar' zu zeigen (owner 2026-08-25).
   */
  smartGates?: boolean;
};

/**
 * Ab wie vielen Produkten lohnt das Kategorie-Gate noch? Gleiche Schwelle
 * wie GpanePivotService.HERO_THRESHOLD: darunter zeigt der Finder die
 * Produkte direkt (Overview/Hero) statt einer weiteren Auswahl-Ebene.
 */
export const SMART_GATE_HERO_THRESHOLD = 40;

export const CATALOG_FLOW_VARIANTS: CatalogFlowVariant[] = [
  { id: 'guided', gates: ['brand', 'sport', 'category'], description: 'Geführte Grafik-Gates: Marke, Sport, Kategorie (Default)' },
  { id: 'open', gates: ['sport', 'category'], description: 'Keine Marken-Vorauswahl — alle Marken, Marke als Pivot-Dimension' },
  { id: 'direct', gates: [], description: 'Sofort in den Finder mit dem gesamten Katalog' },
];

export function resolveCatalogFlow(href?: string): CatalogFlowVariant {
  try {
    const url = new URL(href ?? window.location.href);
    const requested = url.searchParams.get('flow');
    const match = requested && CATALOG_FLOW_VARIANTS.find(variant => variant.id === requested);
    if (match) return match;
  } catch { /* SSR/tests ohne window */ }
  return CATALOG_FLOW_VARIANTS[0];
}

export type CatalogEntryConfig = {
  year: number;
  landing: CatalogLandingMedia;
  sports: CatalogSportConfig[];
  categoriesBySport: Record<string, CatalogCategoryConfig[]>;
};

const label = (value: string): LocalizedLabel => ({ de: value, en: value });

/**
 * Media je Marken-Kachel im Brand-Gate (owner 2026-08-25, media 120623).
 * Schluessel = Facet-Name aus der API. Unbekannte Marken rendern ohne Bild.
 * O'Neal: Marketing-Actionshot (Media-KG); ONE/Kini: markante Helm-
 * Produktbilder, freigestellt auf der dunklen Kachel (fit: contain).
 */
export const BRAND_BANNERS: Record<string, CatalogLandingMedia> = {
  "O'Neal": { mode: 'image', storageId: 19018, fit: 'cover', position: 'center 25%' },
  // Seit dem GSG-Portal-Import (Issue #1334) liegen auch KINI/ONE-Mood-
  // Shots im KG — die Produkt-Helme waren nur Platzhalter (2026-08-25).
  'ONE Industries': { mode: 'image', storageId: 31795, fit: 'cover', position: 'center 35%' },
  'Kini Red Bull': { mode: 'image', storageId: 31318, fit: 'cover', position: 'center 30%' },
};

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
      bannersByBrand: {
        "O'Neal": { mode: 'image', storageId: 17577 },
        'Kini Red Bull': { mode: 'image', storageId: 30976, position: 'center 45%' },
        'ONE Industries': { mode: 'image', storageId: 31795, position: 'center 42%' },
      },
    },
    {
      id: 'mtb',
      labels: label('MTB'),
      sportValues: ['MTB'],
      enabled: true,
      banner: { mode: 'image', storageId: 15344 },
      bannersByBrand: {
        "O'Neal": { mode: 'image', storageId: 15344 },
        'Kini Red Bull': { mode: 'image', storageId: 31537, position: 'center 42%' },
        // Das ONE-Portal liefert keine Area-Zuordnung; dieser zweite echte
        // ONE-Mood-Shot hält die Markenidentität auch am MTB-Einstieg stabil.
        'ONE Industries': { mode: 'image', storageId: 31802, position: 'center 44%' },
      },
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

/** Resolve the sport artwork from the selected brand without losing the generic fallback. */
export function getCatalogSportBanner(
  sport: CatalogSportConfig,
  brand?: string | null,
): CatalogLandingMedia | undefined {
  return (brand ? sport.bannersByBrand?.[brand] : undefined) ?? sport.banner;
}
