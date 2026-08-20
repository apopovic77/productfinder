import { ProductsApi, CategoriesFacetsApi, Configuration, type ProductDetail as OnealProduct } from 'arkturian-oneal-sdk';
import { Product, type ProductData, ProductAttribute, type PrimitiveAttributeValue, type AttributeType } from '../types/Product';
import { ACTIVE_PIVOT_PROFILE } from '../config/pivot';
import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

const API_BASE = ONEAL_API_BASE;
const API_KEY = ONEAL_API_KEY;

// Initialize SDK. The generated operation paths already include the /v1
// prefix (e.g. `/v1/products`), while ONEAL_API_BASE ends in /v1 for the
// plain-fetch call sites — strip it here or every SDK request hits /v1/v1.
const config = new Configuration({
  basePath: API_BASE.replace(/\/v1\/?$/, ''),
  apiKey: API_KEY,
});
const productsApi = new ProductsApi(config);
const facetsApi = new CategoriesFacetsApi(config);

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
  brand?: string;
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

export type ContentLanguageFacet = {
  locale: string;
  category_coverage: number;
  product_coverage: number;
  available: boolean;
};

export type FacetsData = {
  brands?: Array<{ name: string; count: number; count_with_image: number }>;
  categories?: Array<Record<string, unknown>>;
  colors?: Array<Record<string, unknown>>;
  sizes?: Array<Record<string, unknown>>;
  price_range?: Record<string, unknown>;
  content_languages?: ContentLanguageFacet[];
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

// SDK 1.1.0's ProductDetail dropped legacy fields (media, sku, season,
// specifications, meta, price object) that older API payloads may still
// carry and that this mapper supports for both shapes. The intersection
// keeps current fields typed while allowing legacy access.
type ApiProduct = OnealProduct & Record<string, any>;

function mapProduct(p: ApiProduct): Product | null {
  const attributes: Record<string, ProductAttribute> = {};
  const variants = Array.isArray((p as any)?.variants) ? (p as any).variants : [];
  const apiAny = p as any;

  // === V2 API: Use flat properties from API ===
  const props = apiAny.properties ?? {};
  const sport = Array.isArray(props.sport) ? props.sport : [];
  const targetGroup = props.target_group ?? 'Erwachsene';
  const bodyPart = props.body_part ?? null;
  const productFunction = props.product_function ?? null;
  const productType = props.product_type ?? null;
  const productLine = props.product_line ?? null;

  // Derive presentation category from product_type or category
  const presentationCategory = productType
    ?? (typeof apiAny.category === 'string' ? apiAny.category : null)
    ?? 'Sonstiges';

  // Build category array for compatibility
  const categories = [presentationCategory];
  if (productLine) categories.push(productLine);

  // === Add V2 Properties as Attributes ===

  // Sport (can be multiple: MX, MTB)
  addAttribute(attributes, sport.length
    ? {
        key: 'sport',
        label: 'Sport',
        type: 'enum',
        value: sport.join(', '),
        sourcePath: 'properties.sport',
      }
    : undefined);

  // Target Group (Erwachsene, Jugendliche)
  addAttribute(attributes, targetGroup
    ? {
        key: 'target_group',
        label: 'Zielgruppe',
        type: 'enum',
        value: targetGroup,
        sourcePath: 'properties.target_group',
      }
    : undefined);

  // Body Part (Kopf, Oberkörper, Hände, Beine, Füße)
  addAttribute(attributes, bodyPart
    ? {
        key: 'body_part',
        label: 'Körperteil',
        type: 'enum',
        value: bodyPart,
        sourcePath: 'properties.body_part',
      }
    : undefined);

  // Product Function (Schutz, Bekleidung, Sicht, Transport, Accessoire)
  addAttribute(attributes, productFunction
    ? {
        key: 'product_function',
        label: 'Funktion',
        type: 'enum',
        value: productFunction,
        sourcePath: 'properties.product_function',
      }
    : undefined);

  // Product Type (Helm, Brille, Jersey, Hose, Handschuh, Protektor, Stiefel)
  addAttribute(attributes, productType
    ? {
        key: 'product_type',
        label: 'Produkttyp',
        type: 'enum',
        value: productType,
        sourcePath: 'properties.product_type',
      }
    : undefined);

  // Product Line (10SRS, B-55, Matrix, Element)
  addAttribute(attributes, productLine
    ? {
        key: 'product_line',
        label: 'Produktlinie',
        type: 'enum',
        value: productLine,
        sourcePath: 'properties.product_line',
      }
    : undefined);

  // Presentation Category (main pivot dimension)
  addAttribute(attributes, presentationCategory
    ? {
        key: 'presentation_category',
        label: 'Produktkategorie',
        type: 'enum',
        value: presentationCategory,
        sourcePath: 'properties.product_type',
      }
    : undefined);

  // Category from API (ERP category - skip Z-categories like spare parts/merchandise)
  const categoryValue = apiAny.category as string | undefined;
  addAttribute(attributes, categoryValue && !categoryValue.startsWith('Z-')
    ? {
        key: 'category_primary',
        label: 'Category',
        type: 'enum',
        value: categoryValue,
        sourcePath: 'category',
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

  // Season - handle v2 API format
  const seasonValue = apiAny.season ?? (p as any).season ?? null;
  addAttribute(attributes, typeof seasonValue === 'number'
    ? {
        key: 'season',
        label: 'Saison',
        type: 'number',
        value: seasonValue,
        sourcePath: 'season',
      }
    : undefined);

  // Price - handle v2 API format (price_from number)
  const priceValue = apiAny.price_from ?? ((p as any).price?.value) ?? null;
  addAttribute(attributes, typeof priceValue === 'number'
    ? {
        key: 'price',
        label: 'Preis',
        type: 'number',
        value: priceValue,
        unit: '€',
        normalizedValue: priceValue,
        sourcePath: 'price_from',
      }
    : undefined);

  // Weight from specifications
  addAttribute(attributes, (p as any).specifications?.weight !== undefined
    ? {
        key: 'weight',
        label: 'Gewicht',
        type: 'number',
        value: (p as any).specifications.weight ?? null,
        unit: 'g',
        normalizedValue: (p as any).specifications.weight ?? undefined,
        sourcePath: 'specifications.weight',
      }
    : undefined);

  // Varianten = Farben (color_count from API)
  const colorCount = apiAny.color_count ?? 0;
  addAttribute(attributes, colorCount > 0
    ? {
        key: 'variant_count',
        label: 'Varianten',
        type: 'number',
        value: colorCount,
        sourcePath: 'color_count',
      }
    : undefined);

  // Größen = unique sizes (size_count from API)
  const sizeCount = apiAny.size_count ?? 0;
  addAttribute(attributes, sizeCount > 0
    ? {
        key: 'size_count',
        label: 'Größen',
        type: 'number',
        value: sizeCount,
        sourcePath: 'size_count',
      }
    : undefined);

  // Größen-Typ (shoe, boot, helmet, pants, clothing, sock)
  const sizeType = apiAny.size_type;
  const sizeTypeLabels: Record<string, string> = {
    shoe: 'Schuhgrößen',
    boot: 'Stiefelgrößen',
    helmet: 'Helmgrößen',
    pants: 'Hosengrößen',
    clothing: 'Konfektionsgrößen',
    sock: 'Sockengrößen',
    other: 'Sonstige',
  };
  addAttribute(attributes, sizeType && sizeType !== 'other'
    ? {
        key: 'size_type',
        label: 'Größentyp',
        type: 'enum',
        value: sizeTypeLabels[sizeType] || sizeType,
        sourcePath: 'size_type',
      }
    : undefined);

  // Image count (has image or not)
  const hasImage = apiAny.storage?.id ? 1 : 0;
  addAttribute(attributes, {
    key: 'has_image',
    label: 'Hat Bild',
    type: 'number',
    value: hasImage,
    sourcePath: 'storage.id',
  });

  // Product code (for grouping)
  addAttribute(attributes, apiAny.product_code
    ? {
        key: 'product_code',
        label: 'Produktcode',
        type: 'string',
        value: apiAny.product_code,
        sourcePath: 'product_code',
      }
    : undefined);

  // Family name (for grouped display)
  addAttribute(attributes, apiAny.family_name
    ? {
        key: 'family_name',
        label: 'Produktfamilie',
        type: 'string',
        value: apiAny.family_name,
        sourcePath: 'family_name',
      }
    : undefined);

  // Family size (sibling count)
  addAttribute(attributes, typeof apiAny.family_size === 'number'
    ? {
        key: 'family_size',
        label: 'Farbvarianten',
        type: 'number',
        value: apiAny.family_size,
        sourcePath: 'family_size',
      }
    : undefined);

  // Model year (Jahrgang) - as enum/string so it becomes discrete buckets, not numeric ranges
  addAttribute(attributes, typeof apiAny.model_year === 'number' && apiAny.model_year > 0
    ? {
        key: 'model_year',
        label: 'Jahrgang',
        type: 'enum',
        value: String(apiAny.model_year),
        sourcePath: 'model_year',
      }
    : undefined);

  // Is spare part
  addAttribute(attributes, {
    key: 'is_spare',
    label: 'Ersatzteil',
    type: 'boolean',
    value: apiAny.is_spare === true,
    sourcePath: 'is_spare',
  });

  // Design group (for family grouping - same product, different colors)
  addAttribute(attributes, apiAny.design_group
    ? {
        key: 'design_group',
        label: 'Design',
        type: 'string',
        value: apiAny.design_group,
        sourcePath: 'design_group',
      }
    : undefined);

  // Color name
  addAttribute(attributes, apiAny.color_name
    ? {
        key: 'color_name',
        label: 'Farbe',
        type: 'string',
        value: apiAny.color_name,
        sourcePath: 'color_name',
      }
    : undefined);

  const aiTags = Array.isArray(apiAny.ai_tags)
    ? apiAny.ai_tags.filter((tag: unknown) => typeof tag === 'string' && tag.trim().length)
    : [];

  const posterGroup = derivePosterGroup({
    presentationCategory,
    productFamily: productLine ?? productType ?? undefined,
    productName: p.name ?? '',
    meta: (p as any).meta as Record<string, unknown>,
    aiTags,
  });

  // poster_group removed - not needed as pivot dimension

  const colorTokens = new Set<string>();
  const sizeTokens = new Set<string>();
  for (const variant of variants) {
    // V2 API: use direct color/size fields
    if (variant.color) colorTokens.add(String(variant.color));
    if (variant.size) sizeTokens.add(String(variant.size));
    // V1 fallback: parse from name
    if (!variant.color && variant.name) {
      const parts = String(variant.name)
        .split('/')
        .map((part: string) => part.trim())
        .filter(Boolean);
      if (parts.length >= 1) colorTokens.add(parts[0]);
      if (parts.length >= 2) sizeTokens.add(parts[1]);
    }
  }
  // Also use product-level color_name
  if (!colorTokens.size && apiAny.color_name) {
    colorTokens.add(String(apiAny.color_name));
  }

  // Color variant count (only if variant data is available)
  if (colorTokens.size > 0) {
    addAttribute(attributes, {
      key: 'color_variant_count',
      label: 'Farbvarianten',
      type: 'number',
      value: colorTokens.size,
      sourcePath: 'variants[].color',
    });
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

  const data: ProductData = {
    id: String(p.id),
    sku: p.sku,
    name: p.name ?? '',
    brand: p.brand,
    category: categories,
    season: p.season,
    price: (() => {
      // Handle v2 API format (price_from/price_to numbers)
      const priceValue = (p as any).price_from ?? (p as any).price ?? null;
      if (typeof priceValue === 'number') {
        return { value: priceValue, currency: '€', formatted: `€ ${priceValue.toFixed(2)}` };
      }
      // Handle v1 API format (price object)
      if (priceValue && typeof priceValue === 'object' && 'value' in priceValue) {
        return priceValue;
      }
      return null;
    })(),
    media: filteredMedia.map((item: any) => {
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
    specifications: (p as any).specifications,
    meta: (p as any).meta,
    description: (p as any).meta?.description,
    displayName: p.name ?? undefined,
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
        // V2 API fields
        color: v.color,
        size: v.size,
        description_short: v.description_short,
        storage: v.storage,
        images: v.images,
        weight_grams: v.weight_grams,
        ean: v.ean,
        is_available: v.is_available,
        material: v.material,
        customs_tariff: v.customs_tariff,
        model_year: v.model_year,
        stock_available: v.stock_available,
        is_nos: v.is_nos,
      };
    }),
    raw: p as any,
    trimScale: anyP.storage?.trim?.scale != null ? {
      scale: anyP.storage.trim.scale,
      scale_x: anyP.storage.trim.scale_x,
      scale_y: anyP.storage.trim.scale_y,
    } : undefined,
  };

  return new Product(data);
}

const fullCatalogPromises = new Map<string, Promise<Product[]>>();

function isFullCatalogQuery(query: Query): boolean {
  if (query.limit !== 10000) return false;
  return Object.entries(query).every(([key, value]) =>
    key === 'limit' || key === 'brand' || value === undefined || value === null || value === ''
  );
}

export function buildProductsRequestUrl(query: Query): string {
  const params = new URLSearchParams();
  if (query.brand) params.set('brand', query.brand);
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.price_min !== undefined) params.set('price_min', String(query.price_min));
  if (query.price_max !== undefined) params.set('price_max', String(query.price_max));
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  params.set('has_image', 'true');
  return `${API_BASE}/products?${params.toString()}`;
}

async function fetchProductsFromApi(query: Query): Promise<Product[]> {
  if (query.brand) {
    const response = await fetch(buildProductsRequestUrl(query), {
      headers: { 'X-API-Key': API_KEY },
    });
    if (!response.ok) throw new Error(`Product API failed (${response.status})`);
    const payload = await response.json();
    return (payload.results || [])
      .map(mapProduct)
      .filter((product: Product | null): product is Product => Boolean(product));
  }

  const response = await productsApi.listProductsV1ProductsGet({
    search: query.search,
    category: query.category,
    priceMin: query.price_min,
    priceMax: query.price_max,
    sort: query.sort as any,
    order: query.order as any,
    limit: query.limit,
    offset: query.offset,
    // Server-side filter (SDK 1.1.0 / issue #254) — replaces the old client
    // filter, so count/paging from the API are accurate.
    hasImage: true,
  });

  const results = (response.data as any).results || [];
  const products = results
    .map(mapProduct)
    .filter((product: Product | null): product is Product => Boolean(product));

  return products;
}

export function fetchProducts(query: Query = {}): Promise<Product[]> {
  // The splash wrapper and live controller request the same full catalog.
  // Share that request/result for the browser session instead of fetching and
  // mapping 2,637 products twice. Image loading is intentionally NOT started
  // here: only CanvasRenderer knows which products are visible (issue #1066).
  if (!isFullCatalogQuery(query)) return fetchProductsFromApi(query);

  const cacheKey = query.brand ?? '__all__';
  if (!fullCatalogPromises.has(cacheKey)) {
    fullCatalogPromises.set(cacheKey, fetchProductsFromApi(query).catch(error => {
      fullCatalogPromises.delete(cacheKey);
      throw error;
    }));
  }
  return fullCatalogPromises.get(cacheKey)!;
}

let facetsPromise: Promise<FacetsData> | null = null;

export function fetchFacets(): Promise<FacetsData> {
  // Landing and BrandSelectionGate both need the same contract. Share the
  // request instead of making the entry sequence fetch /facets twice.
  if (!facetsPromise) {
    facetsPromise = facetsApi.getFacetsV1FacetsGet()
      .then(response => response.data as FacetsData)
      .catch(error => {
        facetsPromise = null;
        throw error;
      });
  }
  return facetsPromise;
}

/**
 * Fetch a single product by ID with full details (including variants with images)
 */
export async function fetchProductById(productId: number | string): Promise<Product | null> {
  try {
    const response = await fetch(`${API_BASE}/products/${productId}`, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });
    if (!response.ok) {
      console.error('[ProductRepository] Failed to fetch product:', response.status);
      return null;
    }
    const data = await response.json();
    return mapProduct(data as OnealProduct);
  } catch (error) {
    console.error('[ProductRepository] Error fetching product:', error);
    return null;
  }
}
