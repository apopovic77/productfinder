import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

/**
 * Groessentabelle zum Produkt wie im B2B-Shop hinter dem Info-Punkt bei
 * "Groesse" (owner 2026-11-04, media 132949/132950). Vertrag (Issue #2646):
 *   GET /v1/size-chart?product_id=… -> {storage_id, title, url, rule} | null
 * Ohne Endpunkt, ohne Tabelle oder bei Fehler: null, der Info-Punkt fehlt.
 */
export type SizeChart = { storage_id: number; title: string; url: string; rule?: string };

const cache = new Map<string, Promise<SizeChart | null>>();

export function fetchSizeChart(productId: string | number): Promise<SizeChart | null> {
  const id = String(productId);
  if (!cache.has(id)) {
    const request = fetch(`${ONEAL_API_BASE}/size-chart?product_id=${encodeURIComponent(id)}`, {
      headers: { 'X-API-Key': ONEAL_API_KEY },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        const d = data as Partial<SizeChart> | null;
        return d && typeof d.url === 'string' && d.url ? { storage_id: Number(d.storage_id), title: String(d.title ?? ''), url: d.url, rule: d.rule } : null;
      })
      .catch(() => null);
    cache.set(id, request);
  }
  return cache.get(id)!;
}
