import { DefaultApi, Configuration, type Product as OnealProduct } from 'arkturian-oneal-sdk';
import { Product, type ProductData, ProductAttribute, type PrimitiveAttributeValue, type AttributeType } from '../types/Product';
import { ACTIVE_PIVOT_PROFILE } from '../config/pivot';

const API_BASE = import.meta.env.VITE_ONEAL_API_BASE || 'https://gsgbot.arkturian.com/oneal-api/v1';
const API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

// Initialize SDK
const config = new Configuration({
  basePath: API_BASE,
  apiKey: API_KEY,
});
const api = new DefaultApi(config);

const MEDIA_PLACEHOLDER_TOKENS = ['no-image', 'placeholder', 'shopifycloud/storefront/assets'];

const PIVOT_PROFILE = ACTIVE_PIVOT_PROFILE;

function isRealMedia(item: any): boolean {
  if (!item) return false;
  const src = String(item.src ?? '').toLowerCase();
  if (src && MEDIA_PLACEHOLDER_TOKENS.some(token => src.includes(token))) {
    return false;
  }
  if (!src && typeof item.storage_id !== 'number') {
    return false;
  }
  return true;
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

type PosterGroup =
  | 'poster_apparel'
  | 'poster_gloves'
  | 'poster_shoes'
  | 'poster_protectors'
  | 'poster_accessories'
  | 'poster_goggles'
  | 'poster_other';

function derivePosterGroup(args: {
  presentationCategory?: string | null;
  productFamily?: string | null;
  productName: string;
  meta?: Record<string, unknown>;
  aiTags?: string[];
}): PosterGroup {
  const metaGroup = toString((args.meta as any)?.poster_group);
  if (metaGroup) {
    return sanitizePosterGroup(metaGroup);
  }

  const category = (args.presentationCategory ?? '').toLowerCase();
  const family = (args.productFamily ?? '').toLowerCase();
  const name = (args.productName ?? '').toLowerCase();
  const tags = new Set((args.aiTags ?? []).map(tag => tag.toLowerCase()));

  if (category.includes('brillen') || tags.has('goggle')) {
    return 'poster_goggles';
  }

  if (category.includes('protektoren')) {
    return 'poster_protectors';
  }

  if (category.includes('schuhe')) {
    return 'poster_shoes';
  }

  const isGlove =
    family.includes('handschuh') ||
    family.includes('glove') ||
    name.includes('handschuh') ||
    name.includes('glove') ||
    tags.has('glove');
  if (category.includes('kleidung') && isGlove) {
    return 'poster_gloves';
  }

  if (category.includes('kleidung')) {
    return 'poster_apparel';
  }

  const accessoryKeywords = ['sock', 'socke', 'socken', 'bag', 'backpack', 'toolbag', 'pack', 'neckwarmer', 'waist', 'headband'];
  const isAccessory = accessoryKeywords.some(keyword => name.includes(keyword));
  if (category.includes('accessoire') || isAccessory) {
    return 'poster_accessories';
  }

  if (isGlove) {
    return 'poster_gloves';
  }

  return 'poster_other';
}

function sanitizePosterGroup(value: string): PosterGroup {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'poster_apparel':
    case 'apparel':
      return 'poster_apparel';
    case 'poster_gloves':
    case 'gloves':
      return 'poster_gloves';
    case 'poster_shoes':
    case 'shoes':
      return 'poster_shoes';
    case 'poster_protectors':
    case 'protectors':
      return 'poster_protectors';
    case 'poster_accessories':
    case 'accessories':
      return 'poster_accessories';
    case 'poster_goggles':
    case 'goggles':
      return 'poster_goggles';
    default:
      return 'poster_other';
  }
}

// Helper function to format category path for display
function formatCategoryPath(categoryId: string): string {
  // "cat:mountainbike/mtb-helme" → "mtb-helme"
  // "cat:mountainbike" → "mountainbike"
  return categoryId.split('/').pop()?.replace(/^cat:/, '') || categoryId;
}

function mapProduct(p: OnealProduct): Product | null {
  const attributes: Record<string, ProductAttribute> = {};
  const originalCategories = Array.isArray(p.category) ? p.category.filter(Boolean) : [];
  const originalPrimary = originalCategories[0];
  const originalSecondary = originalCategories[1];
  const taxonomy = (p as any)?.derived_taxonomy ?? {};
  const categoryIds = Array.isArray((p as any).category_ids) ? (p as any).category_ids : [];
  const source = (p.meta as any)?.source ?? taxonomy?.sport ?? null;
  const path = Array.isArray(taxonomy?.path) ? taxonomy.path : undefined;
  const variants = Array.isArray((p as any)?.variants) ? (p as any).variants : [];

  const productUrl = typeof (p.meta as any)?.product_url === 'string' ? (p.meta as any).product_url : null;
  const presentationCategory = PIVOT_PROFILE.derivePresentationCategory({
    primaryCategory: originalPrimary,
    secondaryCategory: originalSecondary,
    productName: p.name,
    productUrl,
    taxonomy,
  });
  const sportLabel = PIVOT_PROFILE.formatTokenLabel(source);
  const taxonomySportLabel = taxonomy?.sport ? PIVOT_PROFILE.formatTokenLabel(taxonomy.sport) : undefined;
  const formattedTaxonomyPath = PIVOT_PROFILE.formatTokenPath(path);

  const categories = [...originalCategories];
  if (presentationCategory) {
    if (!categories.length) {
      categories.push(presentationCategory);
    } else {
      categories[0] = presentationCategory;
    }
  }

  addAttribute(attributes, categories[0]
    ? {
        key: 'category_primary',
        label: 'Category',
        type: 'enum',
        value: categories[0],
        sourcePath: 'category[0]',
      }
    : undefined);

  addAttribute(attributes, originalPrimary && originalPrimary !== categories[0]
    ? {
        key: 'legacy_category_primary',
        label: 'Legacy Category',
        type: 'enum',
        value: originalPrimary,
        sourcePath: 'category_original[0]',
      }
    : undefined);

  addAttribute(attributes, categories[1]
    ? {
        key: 'category_secondary',
        label: 'Subcategory',
        type: 'enum',
        value: categories[1],
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
        value: formatCategoryPath(categoryIds[0]),
        sourcePath: 'category_ids[0]',
      }
    : undefined);

  addAttribute(attributes, source
    ? {
        key: 'sport',
        label: 'Sport',
        type: 'enum',
        value: sportLabel ?? source,
        sourcePath: 'meta.source',
      }
    : undefined);

  addAttribute(attributes, taxonomy?.sport && taxonomy.sport !== source
    ? {
        key: 'taxonomy_sport',
        label: 'Taxonomy Sport',
        type: 'enum',
        value: taxonomySportLabel ?? taxonomy.sport,
        sourcePath: 'derived_taxonomy.sport',
      }
    : undefined);

  const normalizedFamily = PIVOT_PROFILE.normalizeProductFamily({
    presentationCategory,
    rawFamily: taxonomy?.product_family ?? null,
    taxonomyPath: path,
    productName: p.name,
  });

  addAttribute(attributes, normalizedFamily ?? taxonomy?.product_family
    ? {
        key: 'product_family',
        label: 'Product Family',
        type: 'enum',
        value: normalizedFamily ?? taxonomy?.product_family ?? undefined,
        sourcePath: 'derived_taxonomy.product_family',
      }
    : undefined);

  addAttribute(attributes, path && path.length
    ? {
        key: 'taxonomy_path',
        label: 'Taxonomy Path',
        type: 'enum',
        value: formattedTaxonomyPath ?? path.join('>'),
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

  const apiAny = p as any;
  const aiTags = Array.isArray(apiAny.ai_tags)
    ? apiAny.ai_tags.filter((tag: unknown) => typeof tag === 'string' && tag.trim().length)
    : [];

  const posterGroup = derivePosterGroup({
    presentationCategory,
    productFamily: normalizedFamily ?? taxonomy?.product_family ?? undefined,
    productName: p.name,
    meta: p.meta as Record<string, unknown>,
    aiTags,
  });

  addAttribute(attributes, {
    key: 'poster_group',
    label: 'Poster Gruppe',
    type: 'enum',
    value: posterGroup,
    sourcePath: 'poster.group',
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

  // Support v2 API format: synthesize media from storage object if no media array
  let mediaArray = p.media ?? [];
  const anyP = p as any;
  if (!mediaArray.length && anyP.storage?.id) {
    // Create synthetic media entry from storage object
    mediaArray = [{
      src: anyP.storage.media_url || '',
      storage_id: anyP.storage.id,
      role: 'hero',
    } as any];
  }
  // Also check for images array (v2 product detail format)
  if (!mediaArray.length && Array.isArray(anyP.images)) {
    mediaArray = anyP.images.map((img: any) => ({
      src: img.image_path || '',
      storage_id: img.storage?.id,
      role: img.role || 'gallery',
    }));
  }

  const filteredMedia = mediaArray.filter(isRealMedia);
  if (!filteredMedia.length) {
    return null;
  }

  const data: ProductData = {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: categories.length ? categories : originalCategories,
    season: p.season,
    price: p.price,
    media: filteredMedia.map(item => {
      const anyItem = item as any;
      // Support both v1 format (storage_id) and v2 format (storage.id)
      const storageId = typeof anyItem?.storage_id === 'number'
        ? anyItem.storage_id
        : typeof anyItem?.storage?.id === 'number'
          ? anyItem.storage.id
          : undefined;
      return {
        src: item.src,
        alt: item.alt ?? undefined,
        type: typeof anyItem?.type === 'string' ? anyItem.type : undefined,
        role: typeof anyItem?.role === 'string' ? anyItem.role as any : undefined,
        storage_id: storageId,
      };
    }),
    specifications: p.specifications,
    meta: p.meta as any,
    description: (p.meta as any)?.description,
    displayName: p.name,
    attributes,
    aiTags,
    aiAnalysis,
    variants: variants.map((v: any) => {
      // Support both v1 format (image_storage_id) and v2 format (storage.id)
      const imageStorageId = typeof v.image_storage_id === 'number'
        ? v.image_storage_id
        : typeof v.storage?.id === 'number'
          ? v.storage.id
          : undefined;
      return {
        name: v.name || '',
        sku: v.sku,
        gtin13: v.gtin13,
        price: v.price,
        currency: v.currency,
        availability: v.availability,
        url: v.url,
        image_storage_id: imageStorageId,
        option1: v.option1,
        option2: v.option2,
      };
    }),
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
  const products = results
    .map(mapProduct)
    .filter((product: Product | null): product is Product => Boolean(product));
  
  // Preload images for better UX (non-blocking)
  Product.preloadImages(products);
  
  return products;
}

export async function fetchFacets(): Promise<any> {
  const response = await api.facetsGet();
  return response.data;
}
