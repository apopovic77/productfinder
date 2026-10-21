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
export type RegistryBackground = { style: string; style_name?: string | null; storage_id: number; media_url: string; light?: boolean };

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
          const style = byStyle.get(bg.style) ?? { id: bg.style, label: bg.style_name || names.get(bg.style) || bg.style, storageIds: [], light: bg.light };
          style.storageIds.push(bg.storage_id);
          byStyle.set(bg.style, style);
        }
        return [STAGE_BACKGROUND_STYLES[0], ...Array.from(byStyle.values()).sort((a, b) => a.id.localeCompare(b.id))];
      })
      .catch(() => null));
  }
  return registryCache.get(id)!;
}
