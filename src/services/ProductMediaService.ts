import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

/**
 * Client for the oneal-api-v2 media endpoints (knowledge-graph backed).
 *
 * The semantic search runs over AI-generated image descriptions of the
 * O'Neal media library (mood shots / lifestyle imagery have no structured
 * product mapping — semantic search is the only way to find them).
 */

export interface LifestyleMediaHit {
  storage_id: number;
  similarity: number;
  source_description: string;
  derivatives?: {
    thumb?: { url: string; width?: number };
    print?: { url: string; width?: number };
  };
  dim?: { w: number; h: number };
  product_numbers?: string[];
}

interface SemanticSearchResponse {
  query: string;
  count: number;
  results: LifestyleMediaHit[];
}

// Curation floor of the media-server catalog — below this the hits stop
// being visually related to the product.
export const LIFESTYLE_MIN_SIMILARITY = 45;

// Per-session memo — the media inventory changes rarely, and the modal
// re-mounts on every product click.
const searchCache = new Map<string, LifestyleMediaHit[]>();

export async function searchLifestyleMedia(
  query: string,
  limit = 6,
): Promise<LifestyleMediaHit[]> {
  const cacheKey = `${query}|${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${ONEAL_API_BASE}/media/semantic-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': ONEAL_API_KEY,
    },
    body: JSON.stringify({ q: query, limit }),
  });
  if (!res.ok) {
    throw new Error(`semantic-search failed: ${res.status}`);
  }
  const data: SemanticSearchResponse = await res.json();
  const hits = Array.isArray(data.results) ? data.results : [];
  searchCache.set(cacheKey, hits);
  return hits;
}

export interface ProductMediaItem {
  storage_id: number;
  doc_type: string;
  is_video: boolean;
  title?: string;
  product_numbers?: string[];
  thumb_url: string;
  full_url: string;
}

interface ByProductResponse {
  product_code: string;
  count: number;
  media: ProductMediaItem[];
}

const byProductCache = new Map<string, ProductMediaItem[]>();

/**
 * Structured product media (sizecharts, manuals, videos …) via prefix match
 * on the variant SKUs. Server caches for 1h; unknown codes return count=0.
 */
export async function fetchProductMedia(
  productCode: string,
  docTypes?: string[],
): Promise<ProductMediaItem[]> {
  const filter = docTypes?.length ? `?doc_type=${encodeURIComponent(docTypes.join(','))}` : '';
  const cacheKey = `${productCode}|${filter}`;
  const cached = byProductCache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${ONEAL_API_BASE}/media/by-product/${encodeURIComponent(productCode)}${filter}`, {
    headers: { 'X-API-Key': ONEAL_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`by-product failed: ${res.status}`);
  }
  const data: ByProductResponse = await res.json();
  const media = Array.isArray(data.media) ? data.media : [];
  byProductCache.set(cacheKey, media);
  return media;
}
