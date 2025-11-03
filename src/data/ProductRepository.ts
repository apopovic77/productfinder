import { DefaultApi, Configuration, type Product as OnealProduct } from 'arkturian-oneal-sdk';
import { Product, type ProductData, ProductAttribute, type PrimitiveAttributeValue, type AttributeType } from '../types/Product';

const API_BASE = import.meta.env.VITE_ONEAL_API_BASE || 'https://oneal-api.arkturian.com/v1';
const API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

// Initialize SDK
const config = new Configuration({
  basePath: API_BASE,
  apiKey: API_KEY,
});
const api = new DefaultApi(config);

const PRESENTATION_CATEGORY_ORDER = [
  'Helme',
  'Brillen',
  'Kleidung',
  'Protektoren',
  'Schuhe & Stiefel',
  'Accessoires',
] as const;
type PresentationCategory = (typeof PRESENTATION_CATEGORY_ORDER)[number];

function derivePresentationCategory(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  productName: string,
  productUrl: string | null | undefined,
): PresentationCategory {
  const prim = primary?.toLowerCase().trim() ?? '';
  const sec = secondary?.toLowerCase().trim() ?? '';
  const name = productName.toLowerCase();
  const url = productUrl?.toLowerCase() ?? '';

  if (name.includes('goggle') || name.includes('brille') || url.includes('goggle')) {
    return 'Brillen';
  }

  switch (prim) {
    case 'helmets':
      return 'Helme';
    case 'protectors':
      return 'Protektoren';
    case 'shoes':
      return 'Schuhe & Stiefel';
    case 'accessories':
      return 'Accessoires';
    case 'clothing':
    case 'gloves':
      return 'Kleidung';
    case 'other':
      if (sec === 'protectors') return 'Protektoren';
      if (sec === 'shoes') return 'Schuhe & Stiefel';
      break;
  }

  if (name.includes('helmet') || name.includes('helm')) return 'Helme';
  if (name.includes('protector') || name.includes('protektor')) return 'Protektoren';
  if (name.includes('boot') || name.includes('stiefel') || name.includes('shoe')) return 'Schuhe & Stiefel';
  if (
    name.includes('glove') ||
    name.includes('handschuh') ||
    name.includes('jersey') ||
    name.includes('hose') ||
    name.includes('pant') ||
    name.includes('shirt')
  ) {
    return 'Kleidung';
  }

  return 'Accessoires';
}

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
type AttributeInit = {
  key: string;
  label: string;
  type: AttributeType;
  value: PrimitiveAttributeValue;
  unit?: string;
  normalizedValue?: number;
  sourcePath?: string;
};

function addAttribute(store: Record<string, ProductAttribute>, init?: AttributeInit | null | undefined) {
  if (!init || init.value === null || init.value === undefined || init.value === '') return;
  store[init.key] = new ProductAttribute(init);
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
  const primaryCategory = p.category?.[0];
  const secondaryCategory = p.category?.[1];
  const taxonomy = (p as any)?.derived_taxonomy ?? {};
  const categoryIds = Array.isArray((p as any).category_ids) ? (p as any).category_ids : [];
  const source = (p.meta as any)?.source ?? taxonomy?.sport ?? null;
  const path = Array.isArray(taxonomy?.path) ? taxonomy.path : undefined;
  const variants = Array.isArray((p as any)?.variants) ? (p as any).variants : [];
  const productUrl = typeof (p.meta as any)?.product_url === 'string' ? (p.meta as any).product_url : null;
  const presentationCategory = derivePresentationCategory(
    primaryCategory,
    secondaryCategory,
    p.name,
    productUrl,
  );

  addAttribute(attributes, primaryCategory
    ? {
        key: 'category_primary',
        label: 'Category',
        type: 'enum',
        value: primaryCategory,
        sourcePath: 'category[0]',
      }
    : undefined);

  addAttribute(attributes, secondaryCategory
    ? {
        key: 'category_secondary',
        label: 'Subcategory',
        type: 'enum',
        value: secondaryCategory,
        sourcePath: 'category[1]',
      }
    : undefined);

  addAttribute(attributes, presentationCategory
    ? {
        key: 'presentation_category',
        label: 'Produktkategorie',
        type: 'enum',
        value: presentationCategory,
        sourcePath: 'presentation.category',
      }
    : undefined);

  addAttribute(attributes, categoryIds[0]
    ? {
        key: 'category_path',
        label: 'Category Path',
        type: 'enum',
        value: categoryIds[0],
        sourcePath: 'category_ids[0]',
      }
    : undefined);

  addAttribute(attributes, source
    ? {
        key: 'sport',
        label: 'Sport',
        type: 'enum',
        value: source,
        sourcePath: 'meta.source',
      }
    : undefined);

  addAttribute(attributes, taxonomy?.sport && taxonomy.sport !== source
    ? {
        key: 'taxonomy_sport',
        label: 'Taxonomy Sport',
        type: 'enum',
        value: taxonomy.sport,
        sourcePath: 'derived_taxonomy.sport',
      }
    : undefined);

  addAttribute(attributes, taxonomy?.product_family
    ? {
        key: 'product_family',
        label: 'Product Family',
        type: 'enum',
        value: taxonomy.product_family,
        sourcePath: 'derived_taxonomy.product_family',
      }
    : undefined);

  addAttribute(attributes, path && path.length
    ? {
        key: 'taxonomy_path',
        label: 'Taxonomy Path',
        type: 'enum',
        value: path.join('>'),
        sourcePath: 'derived_taxonomy.path',
      }
    : undefined);

  addAttribute(attributes, p.brand
    ? {
        key: 'brand',
        label: 'Brand',
        type: 'string',
        value: p.brand,
        sourcePath: 'brand',
      }
    : undefined);

  addAttribute(attributes, typeof p.season === 'number'
    ? {
        key: 'season',
        label: 'Season',
        type: 'number',
        value: p.season,
        sourcePath: 'season',
      }
    : undefined);

  addAttribute(attributes, p.price
    ? {
        key: 'price',
        label: 'Price',
        type: 'number',
        value: p.price.value,
        unit: p.price.currency,
        normalizedValue: p.price.value,
        sourcePath: 'price.value',
      }
    : undefined);

  addAttribute(attributes, p.specifications?.weight !== undefined
    ? {
        key: 'weight',
        label: 'Weight',
        type: 'number',
        value: p.specifications!.weight ?? null,
        unit: 'g',
        normalizedValue: p.specifications!.weight ?? undefined,
        sourcePath: 'specifications.weight',
      }
    : undefined);

  addAttribute(attributes, {
    key: 'variant_count',
    label: 'Variant Count',
    type: 'number',
    value: variants.length,
    sourcePath: 'variants.length',
  });

  const colorTokens = new Set<string>();
  const sizeTokens = new Set<string>();
  for (const variant of variants) {
    if (!variant?.name) continue;
    const parts = String(variant.name)
      .split('/')
      .map((part: string) => part.trim())
      .filter(Boolean);
    if (parts.length >= 1) colorTokens.add(parts[0]);
    if (parts.length >= 2) sizeTokens.add(parts[1]);
  }

  addAttribute(attributes, colorTokens.size
    ? {
        key: 'variant_colors',
        label: 'Variant Colors',
        type: 'enum',
        value: Array.from(colorTokens).join('|'),
        sourcePath: 'variants[].name',
      }
    : undefined);

  addAttribute(attributes, sizeTokens.size
    ? {
        key: 'variant_sizes',
        label: 'Variant Sizes',
        type: 'enum',
        value: Array.from(sizeTokens).join('|'),
        sourcePath: 'variants[].name',
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
