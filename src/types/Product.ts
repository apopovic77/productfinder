
import { ProductAttribute } from '../domain/ProductAttribute';
import type { PrimitiveAttributeValue } from '../domain/ProductAttribute';
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

export type ProductVariant = {
  name: string;
  sku?: string;
  gtin13?: string;
  price?: number;
  currency?: string;
  availability?: string;
  url?: string;
  image_storage_id?: number;
  option1?: string;
  option2?: string;
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
  public readonly aiTags: string[];
  public readonly aiAnalysis?: ProductAIAnalysis;
  public readonly variants?: ProductVariant[];
  public readonly raw: Record<string, unknown>;
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
  }

  get primaryImage(): MediaItem | undefined {
    return this.media?.[0];
  }

  get imageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'https://via.placeholder.com/256?text=No+Image';

    // Prefer Storage API for optimized images (via proxy for authentication)
    if (media.storage_id) {
      const width = 130;
      const quality = 75;
      return `https://share.arkturian.com/proxy.php?id=${media.storage_id}&width=${width}&format=webp&quality=${quality}`;
    }

    // Fallback to Shopify CDN
    return media.src;
  }

  get fullImageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'https://via.placeholder.com/800?text=No+Image';

    // Prefer Storage API for optimized images (800px WebP, via proxy for authentication)
    if (media.storage_id) {
      return `https://share.arkturian.com/proxy.php?id=${media.storage_id}&width=800&format=webp&quality=85`;
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
    if (this.price) {
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

    const loadPromise = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      // Don't set crossOrigin - not needed unless we're using Canvas
      // img.crossOrigin = 'anonymous';

      img.onload = () => {
        // Validate that image actually loaded correctly
        if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
          console.warn(`Image loaded but appears corrupt: ${url} (naturalWidth: ${img.naturalWidth}, naturalHeight: ${img.naturalHeight})`);

          // Treat as error - keep existing image
          this._imageLoading = false;
          // Only set error flag if we don't have an existing image to fall back to
          if (!this._image) {
            this._imageError = true;
          }
          Product.loadingPromises.delete(url);

          const now = Date.now();
          const info = Product.failedUrlAttempts.get(url);
          if (info && now - info.lastFailed < Product.RETRY_COOLDOWN_MS) {
            Product.failedUrlAttempts.set(url, { count: info.count + 1, lastFailed: now });
          } else {
            Product.failedUrlAttempts.set(url, { count: 1, lastFailed: now });
          }

          // Try retry with refresh=true if this was the first attempt
          if (!url.includes('refresh=true') && (!info || info.count === 0)) {
            console.log(`Retrying with refresh=true: ${url}`);
            const refreshUrl = url + (url.includes('?') ? '&' : '?') + 'refresh=true';

            // Retry once with refresh parameter
            const retryImg = new Image();
            retryImg.onload = () => {
              if (retryImg.complete && retryImg.naturalWidth > 0 && retryImg.naturalHeight > 0) {
                this._image = retryImg;
                this._imageLoading = false;
                this._imageError = false;
                Product.imageCache.set(refreshUrl, retryImg);
                Product.failedUrlAttempts.delete(url);
                resolve(retryImg);
              } else {
                // Still corrupt - keep old image
                resolve(this._image ?? null);
              }
            };
            retryImg.onerror = () => {
              // Retry failed - keep old image
              resolve(this._image ?? null);
            };
            retryImg.src = refreshUrl;
          } else {
            // No retry - keep old image
            resolve(this._image ?? null);
          }
          return;
        }

        // SUCCESS: Update to new image
        this._image = img;
        this._imageLoading = false;
        Product.imageCache.set(url, img);
        Product.loadingPromises.delete(url);
        Product.failedUrlAttempts.delete(url);
        resolve(img);
      };

      img.onerror = () => {
        this._imageLoading = false;
        // Only set error flag if we don't have an existing image to fall back to
        if (!this._image) {
          this._imageError = true;
        }
        Product.loadingPromises.delete(url);
        console.warn(`Failed to load image for product ${this.id}: ${url} (keeping existing image)`);

        const now = Date.now();
        const info = Product.failedUrlAttempts.get(url);
        if (info && now - info.lastFailed < Product.RETRY_COOLDOWN_MS) {
          Product.failedUrlAttempts.set(url, { count: info.count + 1, lastFailed: now });
        } else {
          Product.failedUrlAttempts.set(url, { count: 1, lastFailed: now });
        }

        // Try retry with refresh=true if this was the first attempt
        if (!url.includes('refresh=true') && (!info || info.count <= 1)) {
          console.log(`🔄 Retrying with refresh=true: ${url}`);
          const refreshUrl = url + (url.includes('?') ? '&' : '?') + 'refresh=true';

          // Retry once with refresh parameter
          const retryImg = new Image();
          retryImg.onload = () => {
            if (retryImg.complete && retryImg.naturalWidth > 0 && retryImg.naturalHeight > 0) {
              console.log(`✅ Retry successful with refresh=true for product ${this.id}`);
              this._image = retryImg;
              this._imageLoading = false;
              this._imageError = false;
              Product.imageCache.set(refreshUrl, retryImg);
              Product.failedUrlAttempts.delete(url);
              resolve(retryImg);
            } else {
              console.warn(`❌ Retry with refresh=true still corrupt for product ${this.id} - keeping existing image`);
              // Still corrupt - keep old image
              resolve(this._image ?? null);
            }
          };
          retryImg.onerror = () => {
            console.warn(`❌ Retry with refresh=true failed for product ${this.id} - keeping existing image`);
            // Retry failed - keep old image
            resolve(this._image ?? null);
          };
          retryImg.src = refreshUrl;
        } else {
          // No retry - keep old image
          console.log(`⏭️ Skipping retry for ${url} (already tried or has refresh=true)`);
          resolve(this._image ?? null);
        }
      };

      img.src = url;
    });

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
