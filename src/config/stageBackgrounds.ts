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
export function stageBackgroundUrl(styleId: string, productId: string | number, base: string = STAGE_BACKGROUND_BASE): string | undefined {
  const style = STAGE_BACKGROUND_STYLES.find(s => s.id === styleId);
  if (!style || style.storageIds.length === 0) return undefined;
  const n = String(productId).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const id = style.storageIds[n % style.storageIds.length];
  return `${base}/storage/media/${id}?width=1200&format=webp&quality=82`;
}
