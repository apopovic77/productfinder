import React, { useEffect, useState } from 'react';

/**
 * Icons der Gruppier-Dimensionen (Post #5627) — inline eingebunden, damit
 * Farbe ueber currentColor und der Akzent ueber --icon-accent wirken.
 * Einzeln nachgeladen: alle 48 zusammen waeren ~320 KB.
 */
const LOADERS = import.meta.glob('../assets/facet-icons/*.svg', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string | null>>();
export const ICON_ACCENT = '#E8632B';

export function loadFacetIconSvg(key: string): Promise<string | null> {
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key)!);
  const loader = LOADERS[`../assets/facet-icons/${key}.svg`];
  if (!loader) return Promise.resolve(null);
  if (!PENDING.has(key)) {
    PENDING.set(key, loader().then(svg => { CACHE.set(key, svg); return svg; }).catch(() => null));
  }
  return PENDING.get(key)!;
}

const IMAGE_CACHE = new Map<string, HTMLImageElement | null>();

/**
 * Fuer den Canvas: das Icon als Bild in der gewuenschten Farbe (currentColor
 * gibt es dort nicht). null, solange es noch laedt — der Render-Loop zeichnet
 * jeden Frame neu und nimmt es beim naechsten Mal mit.
 */
export function facetIconImage(key: string, color: string): HTMLImageElement | null {
  const cacheKey = `${key}|${color}`;
  if (IMAGE_CACHE.has(cacheKey)) {
    const img = IMAGE_CACHE.get(cacheKey);
    return img && img.complete && img.naturalWidth ? img : null;
  }
  IMAGE_CACHE.set(cacheKey, null);
  void loadFacetIconSvg(key).then(svg => {
    if (!svg) return;
    const colored = svg
      .replace(/var\(--icon-accent,\s*currentColor\)/g, ICON_ACCENT)
      .replace(/currentColor/g, color);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
    IMAGE_CACHE.set(cacheKey, img);
  });
  return null;
}

export function FacetIcon({ iconKey, size = 16 }: { iconKey: string | null; size?: number }) {
  const [svg, setSvg] = useState<string | null>(() => (iconKey ? CACHE.get(iconKey) ?? null : null));
  useEffect(() => {
    if (!iconKey) { setSvg(null); return; }
    let alive = true;
    void loadFacetIconSvg(iconKey).then(s => { if (alive) setSvg(s); });
    return () => { alive = false; };
  }, [iconKey]);
  return (
    <span className="pf-facet-icon" aria-hidden="true"
      style={{ width: size, height: size, display: 'inline-flex', flexShrink: 0, ['--icon-accent' as string]: ICON_ACCENT } as React.CSSProperties}
      dangerouslySetInnerHTML={svg ? { __html: svg.replace(/width="24" height="24"/, `width="${size}" height="${size}"`) } : undefined} />
  );
}
