
import { ProductAttribute } from '../domain/ProductAttribute';
import { globalImageQueue } from '../utils/GlobalImageQueue';
import type { PrimitiveAttributeValue } from '../domain/ProductAttribute';
import { buildHighResUrl, buildThumbnailUrl } from '../utils/MediaUrlBuilder';
export { ProductAttribute } from '../domain/ProductAttribute';
export type { PrimitiveAttributeValue } from '../domain/ProductAttribute';
export { ProductValue } from '../domain/ProductValue';

export type Price = {
  currency?: string;
  value: number;
  formatted: string;
};

export type MediaItem = {
  src: string;
  alt?: string;
  type?: string;
  role?: 'hero' | 'gallery' | 'thumbnail';
  storage_id?: number;
};

export type ProductSpecifications = {
  weight?: number;
  dimensions?: string;
  shell_material?: string;
  liner_material?: string;
  [key: string]: any;
};

export type AttributeType = 'string' | 'number' | 'boolean' | 'enum' | 'date' | 'unknown';

export type ProductAttributeInit = {
  label: string;
  type: AttributeType;
  value: PrimitiveAttributeValue;
  unit?: string;
  normalizedValue?: number;
  sourcePath?: string;
};

export type ProductAIAnalysis = {
  colors?: string[];
  materials?: string[];
  visualHarmonyTags?: string[];
  keywords?: string[];
  useCases?: string[];
  features?: string[];
  targetAudience?: string[];
  emotionalAppeal?: string[];
  style?: string;
  layoutNotes?: string;
  dominantColors?: string[];
  colorPalette?: string;
  suggestedTitle?: string;
  suggestedSubtitle?: string;
  collections?: string[];
};

/** Image entry on a v2 variant (subset of the API's product_images row). */
export type VariantImage = {
  id?: number;
  image_path?: string;
  role?: string;
  sort_order?: number;
  storage?: { id?: number; media_url?: string; thumbnail_url?: string | null } | null;
  ai_alt_text?: string | null;
};

export type ProductVariant = {
  /** v1 fields */
  name: string;
  sku?: string;
  gtin13?: string;
  currency?: string;
  availability?: string;
  url?: string;
  image_storage_id?: number;
  option1?: string;
  option2?: string;
  /** price: number (v1) or {gross, net, currency} object (v2) */
  price?: number | { gross?: number | null; net?: number | null; currency?: string; vat_rate?: number };
  /** v2 API fields (oneal-api-v2 variant shape) */
  color?: string;
  size?: string;
  description_short?: string;
  storage?: { id?: number; media_url?: string; thumbnail_url?: string | null } | null;
  images?: VariantImage[];
  is_available?: boolean;
  ean?: string;
  weight_grams?: number | null;
  material?: string | null;
  customs_tariff?: string | null;
  model_year?: number | null;
  stock_available?: number | null;
  is_nos?: boolean;
};

/** Taxonomy info derived by the pivot profile / API. */
export type DerivedTaxonomy = {
  sport?: string | null;
  product_family?: string | null;
  path?: string[];
};

export type TrimScale = {
  scale: number;       // max(scale_x, scale_y) — for uniform scaling
  scale_x: number;
  scale_y: number;
};

export type ProductData = {
  id: string;
  sku?: string;
  name: string;
  brand?: string;
  category?: string[];
  season?: number;
  price?: Price;
  media?: MediaItem[];
  specifications?: ProductSpecifications;
  meta?: Record<string, any>;
  description?: string;
  displayName?: string;
  attributes?: Record<string, ProductAttribute | ProductAttributeInit | undefined>;
  aiTags?: string[];
  aiAnalysis?: ProductAIAnalysis;
  variants?: ProductVariant[];
  raw?: Record<string, unknown>;
  derived_taxonomy?: DerivedTaxonomy;
  key_features?: string[];
  trimScale?: TrimScale;
};

/**
 * Generic product representation with self-managed image loading
 */
export class Product {
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement | null>>();
  private static failedUrlAttempts = new Map<string, { count: number; lastFailed: number }>();
  private static readonly MAX_IMAGE_RETRIES = 2;
  private static readonly RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  public readonly id: string;
  public readonly sku?: string;
  public readonly name: string;
  public readonly brand?: string;
  public readonly category: string[];
  public readonly season?: number;
  public readonly price?: Price;
  public readonly media?: MediaItem[];
  public readonly specifications?: ProductSpecifications;
  public readonly meta?: Record<string, any>;
  public readonly description?: string;
  public readonly displayName: string;
  public readonly attributes: Record<string, ProductAttribute>;
  public readonly trimScale?: TrimScale;
  public readonly aiTags: string[];
  public readonly aiAnalysis?: ProductAIAnalysis;
  public readonly variants?: ProductVariant[];
  public readonly raw: Record<string, unknown>;
  public readonly derived_taxonomy?: DerivedTaxonomy;
  public readonly key_features?: string[];
  private readonly attributeKeys: string[];

  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;
  private _imageError = false;

  constructor(data: ProductData) {
    this.id = data.id;
    this.sku = data.sku;
    this.name = data.name;
    this.brand = data.brand;
    this.category = data.category ?? [];
    this.season = data.season;
    this.price = data.price;
    this.media = data.media;
    this.specifications = data.specifications;
    this.meta = data.meta;
    this.description = data.description;
    this.displayName = data.displayName ?? data.name;
    const attributeMap: Record<string, ProductAttribute> = {};
    const attributeKeys: string[] = [];
    if (data.attributes) {
      for (const [key, attrLike] of Object.entries(data.attributes)) {
        const attr = attrLike;
        if (!attr) continue;
        const attributeInstance = attr instanceof ProductAttribute
          ? attr
          : new ProductAttribute({
              key,
              label: attr.label,
              type: attr.type,
              value: attr.value,
              unit: attr.unit,
              normalizedValue: attr.normalizedValue,
              sourcePath: attr.sourcePath,
            });
        attributeMap[key] = attributeInstance;
        attributeKeys.push(key);
      }
    }
    this.attributes = attributeMap;
    this.attributeKeys = attributeKeys;
    this.aiTags = data.aiTags ?? [];
    this.aiAnalysis = data.aiAnalysis;
    this.variants = data.variants ?? [];
    this.raw = data.raw ?? {};
    this.derived_taxonomy = data.derived_taxonomy;
    this.key_features = data.key_features;
    this.trimScale = data.trimScale;
  }

  get primaryImage(): MediaItem | undefined {
    // Prioritize hero images, fallback to first image
    const heroImage = this.media?.find(m => m.role === 'hero');
    return heroImage || this.media?.[0];
  }

  get imageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"%3E%3Crect fill="%23e0e0e0" width="256" height="256"/%3E%3Ctext x="128" y="128" text-anchor="middle" fill="%23999" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';

    // Prefer Storage API for optimized images
    if (media.storage_id) {
      return buildThumbnailUrl(media.storage_id);
    }

    // Fallback to Shopify CDN
    return media.src;
  }

  get fullImageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="800"%3E%3Crect fill="%23e0e0e0" width="800" height="800"/%3E%3Ctext x="400" y="400" text-anchor="middle" fill="%23999" font-size="24"%3ENo Image%3C/text%3E%3C/svg%3E';

    // Prefer Storage API for the canonical high-resolution WebP preset.
    if (media.storage_id) {
      return buildHighResUrl(media.storage_id);
    }

    // Fallback to Shopify CDN
    return media.src;
  }

  get weight(): number | undefined {
    const direct = this.specifications?.weight;
    if (typeof direct === 'number') return direct;
    const attr = this.attributes['weight'];
    if (attr && typeof attr.value === 'number') return attr.value;
    if (attr && typeof attr.normalizedValue === 'number') return attr.normalizedValue;
    return undefined;
  }

  get priceText(): string {
    if (this.price?.formatted) return this.price.formatted;
    if (this.price?.value != null) {
      const unit = this.price.currency ?? '';
      return unit ? `${this.price.value.toFixed(2)} ${unit}` : this.price.value.toFixed(2);
    }
    const attr = this.attributes['price'];
    if (attr && typeof attr.value === 'number') {
      const unit = attr.unit ?? '';
      return unit ? `${Number(attr.value).toFixed(2)} ${unit}` : Number(attr.value).toFixed(2);
    }
    return '';
  }

  hasAttribute(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, key);
  }

  getAttribute(key: string): ProductAttribute | undefined {
    return this.attributes[key];
  }

  getAttributeValue<T extends PrimitiveAttributeValue = PrimitiveAttributeValue>(key: string): T | undefined {
    const attr = this.attributes[key];
    if (!attr) return undefined;
    return attr.value as T;
  }

  getAttributeDisplayValue(key: string): string | undefined {
    const attr = this.attributes[key];
    if (!attr) return undefined;
    return attr.displayValue;
  }

  listAttributeKeys(): string[] {
    if (this.attributeKeys.length === 0) {
      return Object.keys(this.attributes);
    }
    return [...this.attributeKeys];
  }

  async loadImage(): Promise<HTMLImageElement | null> {
    const url = this.imageUrl;
    return this.loadImageFromUrl(url);
  }

  /**
   * Load image from a specific URL (for LOD system)
   */
  async loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
    const failureMeta = Product.failedUrlAttempts.get(url);
    if (failureMeta) {
      const elapsed = Date.now() - failureMeta.lastFailed;
      if (elapsed > Product.RETRY_COOLDOWN_MS) {
        Product.failedUrlAttempts.delete(url);
      } else if (failureMeta.count >= Product.MAX_IMAGE_RETRIES) {
        // Too many recent failures – keep existing image and skip retry for now
        return this._image ?? null;
      }
    }

    if (Product.imageCache.has(url)) {
      const cachedImg = Product.imageCache.get(url)!;
      // Only update if we don't have an image or if cached image is better
      if (!this._image || this._image.src !== cachedImg.src) {
        this._image = cachedImg;
      }
      return this._image;
    }

    if (Product.loadingPromises.has(url)) {
      return Product.loadingPromises.get(url)!;
    }

    this._imageLoading = true;
    this._imageError = false;

    // All product image loading is routed through the shared globalImageQueue
    // (maxConcurrent=6, priorities, IndexedDB cache). Previously this created
    // raw `new Image()` per product — with 100+ visible grid products that
    // fired 100+ concurrent requests in the first frame (issue #255).
    const isValid = (img: HTMLImageElement) =>
      img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;

    const markFailure = () => {
      const now = Date.now();
      const info = Product.failedUrlAttempts.get(url);
      if (info && now - info.lastFailed < Product.RETRY_COOLDOWN_MS) {
        Product.failedUrlAttempts.set(url, { count: info.count + 1, lastFailed: now });
      } else {
        Product.failedUrlAttempts.set(url, { count: 1, lastFailed: now });
      }
    };

    const loadPromise = (async (): Promise<HTMLImageElement | null> => {
      try {
        const result = await globalImageQueue.add({
          id: `product-${this.id}-${url}`,
          url,
          group: 'product-grid',
          priority: 50, // after hero (0), BEFORE spread alternatives (100+) — issue #261
        });
        if (isValid(result.image)) {
          this._image = result.image;
          this._imageLoading = false;
          Product.imageCache.set(url, result.image);
          Product.loadingPromises.delete(url);
          Product.failedUrlAttempts.delete(url);
          return result.image;
        }
        // Corrupt payload — one retry with cache-busting refresh=true (also queued)
        markFailure();
        if (!url.includes('refresh=true')) {
          const refreshUrl = url + (url.includes('?') ? '&' : '?') + 'refresh=true';
          const retry = await globalImageQueue.add({
            id: `product-${this.id}-refresh-${url}`,
            url: refreshUrl,
            group: 'product-grid',
            priority: 50,
          });
          if (isValid(retry.image)) {
            this._image = retry.image;
            this._imageLoading = false;
            this._imageError = false;
            Product.imageCache.set(refreshUrl, retry.image);
            Product.failedUrlAttempts.delete(url);
            Product.loadingPromises.delete(url);
            return retry.image;
          }
        }
        this._imageLoading = false;
        if (!this._image) this._imageError = true;
        Product.loadingPromises.delete(url);
        return this._image ?? null;
      } catch {
        // Queue-level failure (network error after queue retries, timeout, cancel)
        this._imageLoading = false;
        if (!this._image) this._imageError = true;
        Product.loadingPromises.delete(url);
        markFailure();
        console.warn(`Failed to load image for product ${this.id}: ${url} (keeping existing image)`);
        return this._image ?? null;
      }
    })();

    Product.loadingPromises.set(url, loadPromise);

    const result = await loadPromise;
    return result ?? this._image;
  }

  get image(): HTMLImageElement | null {
    return this._image;
  }

  get isImageReady(): boolean {
    return !!(this._image && this._image.complete && this._image.naturalWidth > 0 && !this._imageError);
  }

  get isImageLoading(): boolean {
    return this._imageLoading;
  }

  get hasImageError(): boolean {
    return this._imageError;
  }

  static clearImageCache(): void {
    Product.imageCache.clear();
    Product.loadingPromises.clear();
  }

  static async preloadImages(products: Product[]): Promise<void> {
    await Promise.allSettled(products.map(p => p.loadImage()));
  }
}
