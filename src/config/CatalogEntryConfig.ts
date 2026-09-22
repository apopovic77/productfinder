import type { TaxonomyNode } from '../gpane/types';
import { ONEAL_TAXONOMY } from '../gpane/oneal-taxonomy';
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
  /** Alte Sport-Zuordnung; leer, wenn `match` den Knoten bestimmt. */
  sportValues: string[];
  /** Zugehoerigkeit laut Baum — hat Vorrang vor sportValues. */
  match?: (product: any) => boolean;
  enabled: boolean;
  comingSoon?: boolean;
  /** Markenbezogene Mood-Shots; `banner` bleibt der Fallback für offene/unbekannte Marken. */
  bannersByBrand?: Record<string, CatalogLandingMedia>;
  banner?: CatalogLandingMedia;
};

export type CatalogCategoryConfig = {
  id: string;
  labels: LocalizedLabel;
  /** Alte ERP-Kategorien; leer, wenn `match` den Knoten bestimmt. */
  categories: string[];
  targetGroup: 'Erwachsene' | 'Jugendliche';
  /** Zugehoerigkeit laut Baum — hat Vorrang vor categories/targetGroup. */
  match?: (product: any) => boolean;
  banner?: CatalogLandingMedia;
  /** Markenbezogene Kategorie-Banner; `banner` bleibt der Fallback (media 120697). */
  bannersByBrand?: Record<string, CatalogLandingMedia>;
  /**
   * How the grid groups this category, depth by depth — the way the B2B
   * shop lays it out (series/line, then model, then colour). Keys are
   * product attribute keys. The pivot engine follows this before scoring;
   * a level that does not split the products (one value, or one per
   * product) is skipped. Omit to leave the choice to scoring.
   */
  grouping?: string[];
};


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
export type CatalogGateId = 'brand' | 'sport' | 'category' | 'series';

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
  { id: 'guided', gates: ['brand', 'sport', 'category', 'series'], description: 'Geführte Grafik-Gates: Marke, Sport, Kategorie, Serie (Default)' },
  { id: 'open', gates: ['sport', 'category', 'series'], description: 'Keine Marken-Vorauswahl — alle Marken, Marke als Pivot-Dimension' },
  { id: 'direct', gates: [], description: 'Sofort in den Finder mit dem gesamten Katalog' },
];

/**
 * Wie wird die Kategorie-Ebene praesentiert (owner 2026-08-26)?
 *  - 'gate'    : Kachel-Seite mit Kategorie-Bannern (heutiger Default)
 *  - 'pivot'   : kein Gate — der Finder startet mit den Kategorien als
 *                Pivot-Spalten (Histogramm)
 *  - 'grouped' : kein Gate — Poster-/Gruppen-Overview der Kategorien
 *  - 'auto'    : kein Gate — die Engine entscheidet (Hero-Schwelle)
 * Auswahl per URL (?catview=<id>; 'category' ist der Slug der gewaehlten
 * Kategorie), Default CATEGORY_PRESENTATION_DEFAULT. Einmal beim Boot
 * gelesen — die Gates schreiben die URL spaeter ohne diesen Param um.
 */
export type CategoryPresentation = 'gate' | 'pivot' | 'grouped' | 'auto';
export const CATEGORY_PRESENTATIONS: CategoryPresentation[] = ['gate', 'pivot', 'grouped', 'auto'];
export const CATEGORY_PRESENTATION_DEFAULT: CategoryPresentation = 'gate';

let bootCategoryPresentation: CategoryPresentation | null = null;

export function resolveCategoryPresentation(href?: string): CategoryPresentation {
  if (!href && bootCategoryPresentation) return bootCategoryPresentation;
  let result: CategoryPresentation = CATEGORY_PRESENTATION_DEFAULT;
  try {
    const url = new URL(href ?? window.location.href);
    const requested = url.searchParams.get('catview');
    if (requested && (CATEGORY_PRESENTATIONS as string[]).includes(requested)) {
      result = requested as CategoryPresentation;
    }
  } catch { /* SSR/tests ohne window */ }
  if (!href) bootCategoryPresentation = result;
  return result;
}

/**
 * Hero-Darstellung (owner 2026-08-29, Vorbild TimGuignard/swiper-carousel):
 * 'row' = bestehende Reihe (Default, unveraendert), 'reveal' = Parallaxe mit
 * Aufrichten und Bodenschatten. Auswahl per URL `?hero=reveal`.
 */
export type HeroVariant = 'row' | 'reveal';

export function resolveHeroVariant(href?: string): HeroVariant {
  try {
    const url = new URL(href ?? window.location.href);
    if (url.searchParams.get('hero') === 'reveal') return 'reveal';
  } catch { /* SSR/tests ohne window */ }
  return 'row';
}

export function resolveCatalogFlow(href?: string): CatalogFlowVariant {
  try {
    const url = new URL(href ?? window.location.href);
    const requested = url.searchParams.get('flow');
    const match = requested && CATALOG_FLOW_VARIANTS.find(variant => variant.id === requested);
    if (match) return match;
  } catch { /* SSR/tests ohne window */ }
  return CATALOG_FLOW_VARIANTS[0];
}

/**
 * Marks a Realtime mint as explicitly brand-open only when the active Finder
 * flow omits the brand gate and therefore has no selected brand authority.
 * Returning undefined keeps guided-flow request bodies wire-compatible.
 */
export function resolveBrandOpenMintFlag(
  brand: string | null,
  href?: string,
): true | undefined {
  return brand === null && !resolveCatalogFlow(href).gates.includes('brand')
    ? true
    : undefined;
}

export type CatalogEntryConfig = {
  year: number;
  landing: CatalogLandingMedia;
  sports: CatalogSportConfig[];
  categoriesBySport: Record<string, CatalogCategoryConfig[]>;
};

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

/**
 * Einstiegs-Stufen aus dem Shop-Baum ableiten (owner 2026-09-22).
 *
 * Bis dahin gab es ZWEI von Hand gepflegte Baeume: hier ein kuratierter
 * Marketing-Baum (MOTO -> MX HELMETS, GOGGLES, MX GEAR …) und in
 * `gpane/oneal-taxonomy.ts` der Baum des Shops (MTB, MX, Motorrad, Frauen,
 * Kinder, Merchandise). Der gefuehrte Einstieg zeigte den einen, der volle
 * Finder den anderen — gleiche Produkte, andere Namen, andere Schnitte.
 * Jetzt ist der Shop-Baum die einzige Quelle; die Banner und die
 * Gruppierungen haengen als `entry`-Angaben an seinen Knoten.
 *
 * Erste Ebene = Sport-Stufe, zweite Ebene = Kategorie-Stufe. Tiefere Ebenen
 * (Kleidung -> Jerseys, Helme -> Full Face) bleiben dem Finder ueberlassen,
 * der sie ueber die Gruppierung zeigt.
 */
function nodeLabels(node: TaxonomyNode): LocalizedLabel {
  return { de: node.label, en: node.label, ...(node.entry?.labels ?? {}) };
}

function sportFromNode(node: TaxonomyNode): CatalogSportConfig {
  return {
    id: node.slug,
    labels: nodeLabels(node),
    sportValues: [],
    match: node.match,
    enabled: true,
    comingSoon: node.entry?.comingSoon,
    banner: node.entry?.banner,
    bannersByBrand: node.entry?.bannersByBrand,
  };
}

function categoryFromNode(node: TaxonomyNode): CatalogCategoryConfig {
  return {
    id: node.slug,
    labels: nodeLabels(node),
    categories: [],
    targetGroup: 'Erwachsene',
    match: node.match,
    banner: node.entry?.banner,
    bannersByBrand: node.entry?.bannersByBrand,
    grouping: node.entry?.grouping,
  };
}

const TREE_SPORTS: CatalogSportConfig[] = ONEAL_TAXONOMY.map(sportFromNode);

const TREE_CATEGORIES: Record<string, CatalogCategoryConfig[]> = Object.fromEntries(
  ONEAL_TAXONOMY.map(node => [node.slug, (node.children ?? []).map(categoryFromNode)]),
);

/**
 * Alte Adressen weiterleiten: Links und Lesezeichen aus der Zeit der zwei
 * Baeume (?sport=moto&category=mx-helmets) landen auf dem passenden Knoten.
 * Schluessel ist `sport/kategorie`, `sport/` steht fuer den Sport allein.
 */
export const LEGACY_ENTRY_ALIASES: Record<string, { sport: string; category: string | null }> = {
  'moto/': { sport: 'mx', category: null },
  'moto/mx-helmets': { sport: 'mx', category: 'helme' },
  'moto/goggles': { sport: 'mx', category: 'brillen' },
  'moto/mx-gear': { sport: 'mx', category: 'kleidung' },
  'moto/rainwear': { sport: 'mx', category: 'kleidung' },
  'moto/gloves': { sport: 'mx', category: 'kleidung' },
  'moto/boots': { sport: 'mx', category: 'stiefel' },
  'moto/protection': { sport: 'mx', category: 'protektoren' },
  'moto/accessories-leisure': { sport: 'mx', category: 'accessories' },
  'moto/street-adventure-helmets': { sport: 'motorrad', category: 'helme' },
  'moto/street-adventure-jackets-pants': { sport: 'motorrad', category: 'kleidung' },
  'moto/youth-helmets': { sport: 'kinder', category: 'kinder-mx' },
  'moto/youth-gear': { sport: 'kinder', category: 'kinder-mx' },
  'moto/youth-goggles': { sport: 'kinder', category: 'kinder-mx' },
  'moto/youth-gloves': { sport: 'kinder', category: 'kinder-mx' },
  'moto/youth-boots': { sport: 'kinder', category: 'kinder-mx' },
  'moto/youth-protection': { sport: 'kinder', category: 'kinder-mx' },
  'mtb/mtb-helmets': { sport: 'mtb', category: 'helme' },
  'mtb/mtb-gear': { sport: 'mtb', category: 'kleidung' },
  'mtb/mtb-goggles': { sport: 'mtb', category: 'brillen' },
  'mtb/mtb-gloves': { sport: 'mtb', category: 'kleidung' },
  'mtb/mtb-shoes': { sport: 'mtb', category: 'schuhe' },
  'mtb/mtb-protection': { sport: 'mtb', category: 'protektoren' },
  'mtb/mtb-accessories-leisure': { sport: 'mtb', category: 'accessories' },
  'mtb/mtb-youth-helmets': { sport: 'kinder', category: 'kinder-mtb' },
  'mtb/mtb-youth-gear': { sport: 'kinder', category: 'kinder-mtb' },
};

export function resolveLegacyEntry(
  sport: string | null,
  category: string | null,
): { sport: string; category: string | null } | null {
  if (!sport) return null;
  return LEGACY_ENTRY_ALIASES[`${sport}/${category ?? ''}`] ?? null;
}

export const CATALOG_ENTRY_CONFIG: CatalogEntryConfig = {
  year: 2027,
  // Alex' finale Medienwahl bleibt ein einzelner Config-Wechsel. Solange kein
  // freigegebenes GSG-Asset vorliegt, rendert die Landing das typografische
  // Gravity-Sports-Group-Logo und benötigt weder Platzhalterdatei noch URL.
  landing: { mode: 'logo' },
  sports: TREE_SPORTS,
  categoriesBySport: TREE_CATEGORIES,
};

export function getLocalizedLabel(labels: LocalizedLabel, locale: CatalogLocale): string {
  return labels[locale] ?? labels.en ?? Object.values(labels)[0] ?? '';
}

/** Resolve the sport artwork from the selected brand without losing the generic fallback. */
export function getCatalogCategoryBanner(
  category: CatalogCategoryConfig,
  brand?: string | null,
): CatalogLandingMedia | undefined {
  return (brand ? category.bannersByBrand?.[brand] : undefined) ?? category.banner;
}

export function getCatalogSportBanner(
  sport: CatalogSportConfig,
  brand?: string | null,
): CatalogLandingMedia | undefined {
  return (brand ? sport.bannersByBrand?.[brand] : undefined) ?? sport.banner;
}

/**
 * LIUS-Katalogmarker (Category-Management 2026-08-26): 'A**' Zubehoer/
 * Ersatzteile und 'Z**' Auslauf sind nicht katalogrelevant. Der Finder
 * kann auf relevante Produkte einschraenken (?relevant=1 / ?relevant=0);
 * Default hier — bis das Team den Umfang der Bildluecke freigegeben hat.
 */
export const RELEVANT_ONLY_DEFAULT = true; // owner 2026-09-11: Ersatzteile/Auslauf standardmäßig raus (?relevant=0 zeigt alles)

export function resolveRelevantOnly(href?: string): boolean {
  try {
    const url = new URL(href ?? window.location.href);
    const v = url.searchParams.get('relevant');
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch { /* SSR/tests */ }
  return RELEVANT_ONLY_DEFAULT;
}
