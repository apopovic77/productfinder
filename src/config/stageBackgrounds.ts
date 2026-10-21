/**
 * Hintergrund-Matrix fuer die Buehne im grossen Produktdialog (owner
 * 2026-10-21, Stile BG01-BG11 nach dem ChatGPT-Entwurf). Je Stil die
 * Storage-Bilder; alle bisherigen sind 4:5 (1122 x 1402). Gibt es fuer eine
 * Produktgruppe spaeter eigene Motive (Helme 1:1, Brillen 5:4), kommen sie in
 * `byGroup`. Bis die Registry im Katalog steht (OnealCatalog), liegt sie hier.
 */
export type StageBackgroundStyle = {
  id: string;
  label: string;
  /** Storage-IDs, Varianten desselben Stils; das Produkt waehlt stabil eine */
  storageIds: number[];
  /** Helles Motiv: Produktschatten/-kontrast anders als auf dunklem Grund */
  light?: boolean;
  /** Szenenart aus der Registry: realistic | studio | abstract */
  scene?: string;
  /** sichtbare Hoehe der Szene in cm (nur realistische Szenen) */
  visibleHeightCm?: number;
};

export const STAGE_BACKGROUND_STYLES: StageBackgroundStyle[] = [
  { id: 'none', label: 'Ohne', storageIds: [] },
  { id: 'BG01', label: 'Clean Studio', storageIds: [131859], light: true },
  { id: 'BG02', label: 'Dark Studio', storageIds: [131858] },
  { id: 'BG03', label: 'Action Dust', storageIds: [131852, 131853, 131857, 131855, 131856] },
  { id: 'BG04', label: 'Golden Hour', storageIds: [131848] },
  { id: 'BG05', label: 'Nature', storageIds: [131854] },
  { id: 'BG06', label: 'Industrial', storageIds: [131851] },
  { id: 'BG07', label: 'Tech / Neon', storageIds: [131850] },
  { id: 'BG08', label: 'Brand', storageIds: [131849] },
  { id: 'BG10', label: 'Track', storageIds: [131847] },
];

export const DEFAULT_STAGE_BACKGROUND = 'BG02';

/** Die Motive liegen im arkturian-Storage (oeffentlich), nicht im oneal-Storage der Produktbilder. */
export const STAGE_BACKGROUND_BASE = 'https://api-storage.arkturian.com';

/** Bild-URL fuer einen Stil; die Variante haengt stabil an der Produkt-id. */
export function stageBackgroundUrl(styleId: string, productId: string | number, base: string = STAGE_BACKGROUND_BASE, styles: StageBackgroundStyle[] = STAGE_BACKGROUND_STYLES): string | undefined {
  const style = styles.find(s => s.id === styleId);
  if (!style || style.storageIds.length === 0) return undefined;
  const n = String(productId).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const id = style.storageIds[n % style.storageIds.length];
  return `${base}/storage/media/${id}?width=1200&format=webp&quality=82`;
}

/**
 * Hintergruende aus der Katalog-Registry (catalog-platform, Route
 * compat/.../backgrounds, OnealCatalog 2026-10-21): je Produkt die Motive
 * seiner Gruppe plus die fuer alle. Ohne Katalog-Anbindung (live mit der
 * alten API) bleibt die Liste oben.
 */
export type RegistryBackground = { style: string; style_name?: string | null; storage_id: number; media_url: string; light?: boolean; scene?: string | null; visible_height_cm?: number | null };

const registryCache = new Map<string, Promise<StageBackgroundStyle[] | null>>();

export function fetchStageBackgrounds(productId: string | number, base: string, key: string): Promise<StageBackgroundStyle[] | null> {
  if (!base) return Promise.resolve(null);
  const id = String(productId);
  if (!registryCache.has(id)) {
    registryCache.set(id, fetch(`${base}/backgrounds?product_id=${encodeURIComponent(id)}`, { headers: { 'X-API-Key': key } })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { styles?: Array<{ id: string; name: string | null }>; backgrounds?: RegistryBackground[] } | null) => {
        if (!data?.backgrounds?.length) return null;
        const names = new Map((data.styles ?? []).map(st => [st.id, st.name]));
        const byStyle = new Map<string, StageBackgroundStyle>();
        for (const bg of data.backgrounds) {
          const style = byStyle.get(bg.style) ?? { id: bg.style, label: bg.style_name || names.get(bg.style) || bg.style, storageIds: [], light: bg.light, scene: bg.scene ?? undefined, visibleHeightCm: bg.visible_height_cm ?? undefined };
          style.storageIds.push(bg.storage_id);
          byStyle.set(bg.style, style);
        }
        return [STAGE_BACKGROUND_STYLES[0], ...Array.from(byStyle.values()).sort((a, b) => a.id.localeCompare(b.id))];
      })
      .catch(() => null));
  }
  return registryCache.get(id)!;
}

// ---------------------------------------------------------------------------
// Passenden Hintergrund je Produkt waehlen (owner 2026-10-21, media 131866/131867):
// Stiefel gehoeren in den Dreck, ein Adventure-Helm nicht; ein roter Helm wirkt
// im warmen/orangen Raum. Je Stil Umgebung und Farbklima, je Produkt Einsatz,
// Typ und Farbe; die Punkte entscheiden, die Wahl per Punkt bleibt moeglich.
// ---------------------------------------------------------------------------

type Env = 'studio' | 'offroad' | 'nature' | 'urban' | 'brand';
type Tone = 'neutral' | 'warm' | 'cool';
export const STYLE_TRAITS: Record<string, { env: Env; tone: Tone; light?: boolean }> = {
  BG01: { env: 'studio', tone: 'neutral', light: true },
  BG02: { env: 'studio', tone: 'neutral' },
  BG03: { env: 'offroad', tone: 'warm' },
  BG04: { env: 'offroad', tone: 'warm' },
  BG05: { env: 'nature', tone: 'cool' },
  BG06: { env: 'urban', tone: 'neutral' },
  BG07: { env: 'studio', tone: 'cool' },
  BG08: { env: 'brand', tone: 'warm' },
  BG10: { env: 'offroad', tone: 'warm' },
};

export type BackgroundProductHints = {
  productType?: string;
  sport?: string;
  /** Name, Linie, Kategorie: daraus Street/Adventure */
  text?: string;
  colorName?: string;
  /** reale Hoehe des Produkts in cm (Katalog height_cm, sonst Richtwert je Typ) */
  heightCm?: number;
};

/**
 * Massstab in realistischen Szenen (Issue #2551, owner 2026-10-21): Das
 * Produkt muss mindestens diesen Anteil der sichtbaren Szenenhoehe haben,
 * sonst wirkt es riesig (Handschuh so gross wie ein Motorrad) und bekommt
 * Studio oder abstrakt. Relativ statt fester cm-Schwelle, damit Youth-Stiefel
 * (34 cm) nicht anders kippen als Erwachsenen-Stiefel (42 cm).
 */
export const MIN_SCENE_FRACTION = 0.22;
/** Sichtbare Hoehe ohne Registry-Wert */
const DEFAULT_VISIBLE_CM: Record<string, number> = { offroad: 150, nature: 180, urban: 250 };

const WARM = /red|orange|yellow|neon|gold|sand|brown|rot|gelb/i;
const COOL = /blue|teal|petrol|navy|green|olive|purple|blau|gr(ü|ue)n/i;
const LIGHT = /white|gray|grey|silver|cream|weiß|weiss|grau/i;

export function rankStageBackgrounds(styles: StageBackgroundStyle[], h: BackgroundProductHints): string[] {
  const type = (h.productType || '').toLowerCase();
  const text = (h.text || '').toLowerCase();
  const sport = (h.sport || '').toUpperCase();
  const first = (h.colorName || '').split('/')[0];
  const street = /adventure|street|sierra|touring|enduro jacket|rain|regen/.test(text);
  const mtbOnly = sport.includes('MTB') && !sport.includes('MX');
  const dirtWear = /stiefel|schuh|boot|hose|pant|jersey|handschuh|glove/.test(type);
  // Helme: Strasse/Adventure auf Asphalt/Beton, MX in den Dreck in der Natur
  // (owner 2026-10-21); dafuer gilt fuer Helme die Massstab-Regel nicht
  const helmet = /helm/.test(type);
  const score = (st: StageBackgroundStyle): number => {
    const t = STYLE_TRAITS[st.id];
    if (!t || st.storageIds.length === 0) return -99;
    // Massstab: zu kleine Produkte nie in realistische Szenen
    const realistic = st.scene ? st.scene === 'realistic' : (t.env === 'offroad' || t.env === 'nature' || t.env === 'urban');
    const visible = st.visibleHeightCm ?? DEFAULT_VISIBLE_CM[t.env];
    if (!helmet && realistic && h.heightCm && visible && h.heightCm / visible < MIN_SCENE_FRACTION) return -50;
    let s = 0;
    // Strasse/Adventure: dunkler Asphalt-/Betonboden (BG02 Dark Studio,
    // 131858), dann Neon mit nassem Asphalt, dann Industrie (owner 2026-10-21)
    if (helmet && street) s += st.id === 'BG02' ? 8 : st.id === 'BG07' ? 6 : { urban: 4, studio: 2, brand: 1, nature: 0, offroad: -4 }[t.env];
    else if (helmet) s += { offroad: 6, nature: 2, brand: 1, studio: 0, urban: -2 }[t.env] + (st.id === 'BG04' || st.id === 'BG10' ? 1 : 0);
    else if (street) s += { studio: 3, urban: 3, nature: 1, brand: 1, offroad: -3 }[t.env];
    else if (mtbOnly) s += { nature: 4, offroad: 1, studio: 1, urban: 0, brand: 0 }[t.env];
    else if (dirtWear) s += { offroad: 4, brand: 1, studio: 1, nature: 1, urban: 0 }[t.env];
    else s += { studio: 2, brand: 2, offroad: 2, urban: 1, nature: 0 }[t.env];
    if (/brille|goggle/.test(type)) s += t.env === 'studio' ? 2 : 0;
    if (WARM.test(first)) s += t.tone === 'warm' ? 2 : 0;
    else if (COOL.test(first)) s += t.tone === 'cool' ? 2 : t.tone === 'neutral' ? 1 : 0;
    else if (LIGHT.test(first)) s += t.light ? 3 : t.tone === 'neutral' ? 1 : 0;
    else s += t.light ? -1 : 0; // schwarz: heller Raum nimmt Kontrast
    return s;
  };
  return styles.filter(st => st.storageIds.length > 0)
    .map(st => ({ id: st.id, s: score(st) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.id);
}
