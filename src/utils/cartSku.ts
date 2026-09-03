/**
 * Warenkorb-Zeile → Veloconnect-Artikelnummern.
 *
 * Der Warenkorb führt je Produkt eine Farbe und eine Größen-Matrix; der
 * B2B-Shop bestellt je Variante (`variants[].sku`, z. B. `0632-411`). Diese
 * Auflösung ist der einzige Ort, an dem die beiden Welten zusammenkommen —
 * sie ist bewusst tolerant gegenüber Größen-Suffixen ("M (57-58)") und
 * bevorzugt bei mehrdeutigen Treffern die Variante, deren SKU zur
 * Artikelnummer der Zeile gehört.
 */

export interface SkuVariant {
  sku?: string;
  color?: string;
  size?: string;
  option1?: string;
  option2?: string;
  price?: unknown;
}

export interface SkuCartLine {
  articleNumber?: string;
  color?: string;
  sizes?: Record<string, number>;
  quantity?: number;
}

export interface ResolvedSkuLine {
  sku: string;
  size: string;
  quantity: number;
}

export interface SkuResolution {
  lines: ResolvedSkuLine[];
  /** Größen, für die keine Variante gefunden wurde (Menge > 0). */
  unresolved: Array<{ size: string; quantity: number }>;
}

const cleanSize = (s: string) => s.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
const norm = (s: string | undefined) => (s || '').trim().toLowerCase();

export function resolveCartLineSkus(line: SkuCartLine, variants: SkuVariant[] | undefined): SkuResolution {
  const wanted = Object.entries(line.sizes || {}).filter(([, q]) => (q || 0) > 0);
  const fallback = wanted.length === 0 && (line.quantity || 0) > 0
    ? [['', line.quantity as number] as [string, number]]
    : [];
  const entries = wanted.length ? wanted : fallback;
  const color = norm(line.color);
  const article = norm(line.articleNumber);
  const lines: ResolvedSkuLine[] = [];
  const unresolved: Array<{ size: string; quantity: number }> = [];

  for (const [size, qty] of entries) {
    const sizeKey = cleanSize(size);
    const candidates = (variants || []).filter(v => {
      if (!v.sku) return false;
      const vColor = norm(v.color || v.option1);
      const vSize = cleanSize(v.size || v.option2 || '');
      const colorOk = !color || !vColor || vColor === color;
      const sizeOk = !sizeKey || vSize === sizeKey;
      return colorOk && sizeOk;
    });
    const pick = candidates.find(v => article && norm(v.sku).startsWith(article))
      ?? candidates.find(v => v.price !== null && v.price !== undefined)
      ?? candidates[0];
    if (pick?.sku) lines.push({ sku: pick.sku, size, quantity: qty });
    else unresolved.push({ size, quantity: qty });
  }
  return { lines, unresolved };
}
