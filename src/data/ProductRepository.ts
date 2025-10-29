import { DefaultApi, Configuration, type Product as OnealProduct } from 'arkturian-oneal-sdk';
import { Product, type ProductData, type ProductAttribute } from '../types/Product';

const API_BASE = import.meta.env.VITE_ONEAL_API_BASE || 'https://oneal-api.arkturian.com/v1';
const API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

// Initialize SDK
const config = new Configuration({
  basePath: API_BASE,
  apiKey: API_KEY,
});
const api = new DefaultApi(config);

export type Query = {
  search?: string;
  category?: string;
  season?: number;
  price_min?: number;
  price_max?: number;
  weight_min?: number;
  weight_max?: number;
  sort?: 'name' | 'price' | 'season' | 'weight';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

/**
 * Map SDK Product to our OOP Product class instance
 */
function addAttribute(store: Record<string, ProductAttribute>, key: string, attr?: ProductAttribute | null) {
  if (!attr) return;
  store[key] = attr;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const cleaned = value
      .map(item => {
        if (item === null || item === undefined) return null;
        const str = String(item).trim();
        return str.length ? str : null;
      })
      .filter((item): item is string => Boolean(item));
    return cleaned.length ? cleaned : undefined;
  }
  const single = String(value).trim();
  return single ? [single] : undefined;
}

function toString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str.length ? str : undefined;
}

function mapProduct(p: OnealProduct): Product {
  const attributes: Record<string, ProductAttribute> = {};

  addAttribute(attributes, 'category', p.category?.[0]
    ? { label: 'Category', type: 'enum', value: p.category[0], sourcePath: 'category[0]' }
    : undefined);

  addAttribute(attributes, 'brand', p.brand
    ? { label: 'Brand', type: 'string', value: p.brand, sourcePath: 'brand' }
    : undefined);

  addAttribute(attributes, 'season', typeof p.season === 'number'
    ? { label: 'Season', type: 'number', value: p.season, sourcePath: 'season' }
    : undefined);

  addAttribute(attributes, 'price', p.price
    ? {
        label: 'Price',
        type: 'number',
        value: p.price.value,
        unit: p.price.currency,
        normalizedValue: p.price.value,
        sourcePath: 'price.value'
      }
    : undefined);

  const apiAny = p as any;
  const aiTags = Array.isArray(apiAny.ai_tags)
    ? apiAny.ai_tags.filter((tag: unknown) => typeof tag === 'string' && tag.trim().length)
    : [];

  const aiAnalysisRaw = apiAny.ai_analysis ?? {};
  const aiAnalysis = Object.keys(aiAnalysisRaw).length
    ? {
        colors: toStringArray(aiAnalysisRaw.colors),
        materials: toStringArray(aiAnalysisRaw.materials),
        visualHarmonyTags: toStringArray(aiAnalysisRaw.visual_harmony_tags),
        keywords: toStringArray(aiAnalysisRaw.keywords),
        useCases: toStringArray(aiAnalysisRaw.use_cases),
        features: toStringArray(aiAnalysisRaw.features),
        targetAudience: toStringArray(aiAnalysisRaw.target_audience),
        emotionalAppeal: toStringArray(aiAnalysisRaw.emotional_appeal),
        style: toString(aiAnalysisRaw.style),
        layoutNotes: toString(aiAnalysisRaw.layout_notes),
        dominantColors: toStringArray(aiAnalysisRaw.dominant_colors),
        colorPalette: toString(aiAnalysisRaw.color_palette),
        suggestedTitle: toString(aiAnalysisRaw.suggested_title),
        suggestedSubtitle: toString(aiAnalysisRaw.suggested_subtitle),
        collections: toStringArray(aiAnalysisRaw.collections),
      }
    : undefined;

  const data: ProductData = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category,
    season: p.season,
    price: p.price,
    media: p.media?.map(item => {
      const anyItem = item as any;
      return {
        src: item.src,
        alt: item.alt ?? undefined,
        type: typeof anyItem?.type === 'string' ? anyItem.type : undefined,
        role: typeof anyItem?.role === 'string' ? anyItem.role as any : undefined,
        storage_id: typeof anyItem?.storage_id === 'number' ? anyItem.storage_id : undefined,
      };
    }),
    specifications: p.specifications,
    meta: p.meta as any,
    description: (p.meta as any)?.description,
    displayName: p.name,
    attributes,
    aiTags,
    aiAnalysis,
    raw: p as any
  };

  return new Product(data);
}

export async function fetchProducts(query: Query = {}): Promise<Product[]> {
  const response = await api.productsGet({
    search: query.search,
    category: query.category,
    season: query.season,
    priceMin: query.price_min,
    priceMax: query.price_max,
    sort: query.sort as any,
    order: query.order as any,
    limit: query.limit,
    offset: query.offset,
  });
  
  const results = (response.data as any).results || [];
  const products = results.map(mapProduct);
  
  // Preload images for better UX (non-blocking)
  Product.preloadImages(products);
  
  return products;
}

export async function fetchFacets(): Promise<any> {
  const response = await api.facetsGet();
  return response.data;
}
