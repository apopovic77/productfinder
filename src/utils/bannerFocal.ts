import { STORAGE_API_BASE, STORAGE_API_KEY } from '../config/apiConfig';

/** Focal Point eines Storage-Bildes in Prozent der Bildkoordinaten. */
export type BannerFocal = { xPct: number; yPct: number; imageAspect: number };

/** Seitenverhaeltnis der Kategorie-Streifen, muss zu CatalogEntry.css passen. */
export const CATEGORY_BANNER_ASPECT_DESKTOP = 7;
export const CATEGORY_BANNER_ASPECT_MOBILE = 2.5;

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Prozentwert fuer `background-position` bei `background-size: cover`, so dass
 * der Focal Point mittig im Container sitzt.
 *
 * `background-position: P%` legt Punkt P% des Bildes auf P% des Containers,
 * nicht in die Mitte (Storage, Post 5521). Bei einem Bild, das breiter oder
 * hoeher als der Container ist, ist f der sichtbare Anteil der beschnittenen
 * Achse; der Punkt sitzt mittig fuer P = (focal - f/2) / (1 - f).
 */
export function focalBackgroundPosition(focal: BannerFocal, containerAspect: number): string {
  const position = (focalPct: number, visible: number) =>
    visible >= 1 ? 50 : clamp(((focalPct / 100 - visible / 2) / (1 - visible)) * 100);
  // Container flacher als das Bild: oben/unten wird beschnitten, sonst links/rechts.
  const verticalVisible = focal.imageAspect / containerAspect;
  const horizontalVisible = containerAspect / focal.imageAspect;
  const x = position(focal.xPct, horizontalVisible);
  const y = position(focal.yPct, verticalVisible);
  return `${x.toFixed(0)}% ${y.toFixed(0)}%`;
}

type BatchFocalResponse = {
  focal_points?: Record<string, {
    focal_point?: { x_pct?: number; y_pct?: number; source?: string } | null;
    image_width?: number;
    image_height?: number;
  }>;
};

/**
 * Gesetzte Focal Points mehrerer Banner mit einem Aufruf. Fehlt ein Punkt oder
 * schlaegt der Aufruf fehl, fehlt die id in der Map; der Aufrufer nimmt dann
 * die Position aus der Konfiguration.
 */
export async function fetchBannerFocals(storageIds: number[]): Promise<Map<number, BannerFocal>> {
  const focals = new Map<number, BannerFocal>();
  const ids = [...new Set(storageIds)].filter(id => Number.isFinite(id));
  if (ids.length === 0) return focals;
  try {
    const query = ids.map(id => `id=${id}`).join('&');
    const response = await fetch(`${STORAGE_API_BASE}/storage/batch/focal?${query}`, {
      headers: { 'X-API-Key': STORAGE_API_KEY },
    });
    if (!response.ok) return focals;
    const data = (await response.json()) as BatchFocalResponse;
    for (const [id, entry] of Object.entries(data.focal_points ?? {})) {
      const point = entry?.focal_point;
      const width = entry?.image_width;
      const height = entry?.image_height;
      if (!point || typeof point.x_pct !== 'number' || typeof point.y_pct !== 'number') continue;
      focals.set(Number(id), {
        xPct: point.x_pct,
        yPct: point.y_pct,
        imageAspect: width && height ? width / height : 2.5,
      });
    }
  } catch {
    // Ohne Focal Points gilt die Position aus CatalogEntryConfig.
  }
  return focals;
}
