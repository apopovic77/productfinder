/**
 * Ersatzbild fuer Produkte ohne Foto (Owner 2026-09-26: "Einen Tag mit
 * coming soon"). Vor allem Neuheiten der naechsten Kollektion haben bei
 * O'Neal noch kein Motiv — 38 von 84 neuen Produkten der Kollektion 2028.
 * Statt eines grauen "No Image" zeigt der Finder eine ruhige Flaeche mit dem
 * Tag COMING SOON. Als SVG-Data-URL, damit Raster, Hero und Produktkarte es
 * ohne Netzabruf wie jedes andere Produktbild laden koennen.
 */
function comingSoonSvg(size: number): string {
  // Transparent wie ein freigestelltes Produktfoto. Im Gruppen-Raster
  // ueberlappen sich die Bilder bewusst und nur der linke Streifen jedes
  // Bildes bleibt sichtbar (~27 %) — deshalb sitzt der Tag senkrecht am
  // linken Rand wie ein Anhaenger, das Kamera-Symbol rechts daneben.
  const tagW = size * 0.2;
  const tagH = size * 0.84;
  const tagX = size * 0.03;
  const tagY = (size - tagH) / 2;
  const font = size * 0.088;
  const icon = size * 0.52;
  const cx = size * 0.62;
  const cy = size * 0.5;
  const tx = tagX + tagW / 2;
  const ty = tagY + tagH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<g fill="none" stroke="#b9b9b9" stroke-width="${size * 0.022}" stroke-linejoin="round">`
    + `<rect x="${cx - icon * 0.6}" y="${cy - icon * 0.38}" width="${icon * 1.2}" height="${icon * 0.8}" rx="${icon * 0.12}"/>`
    + `<path d="M${cx - icon * 0.22} ${cy - icon * 0.38} l${icon * 0.08} ${-icon * 0.14} h${icon * 0.28} l${icon * 0.08} ${icon * 0.14}"/>`
    + `<circle cx="${cx}" cy="${cy + icon * 0.02}" r="${icon * 0.22}"/>`
    + `</g>`
    + `<rect x="${tagX}" y="${tagY}" width="${tagW}" height="${tagH}" rx="${tagW / 2}" fill="#e63312"/>`
    + `<text x="${tx}" y="${ty}" transform="rotate(-90 ${tx} ${ty})" dominant-baseline="central" text-anchor="middle" `
    + `font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="${font}" letter-spacing="${font * 0.1}" fill="#ffffff">COMING SOON</text>`
    + `</svg>`;
}

const cache = new Map<number, string>();

export function comingSoonImageUrl(size: number): string {
  let url = cache.get(size);
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(comingSoonSvg(size))}`;
    cache.set(size, url);
  }
  return url;
}
