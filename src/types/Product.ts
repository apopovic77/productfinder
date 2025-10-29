
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

export type ProductAttribute = {
  label: string;
  type: AttributeType;
  value: string | number | boolean | null;
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
  attributes?: Record<string, ProductAttribute>;
  aiTags?: string[];
  aiAnalysis?: ProductAIAnalysis;
  raw?: Record<string, unknown>;
};

/**
 * Generic product representation with self-managed image loading
 */
export class Product {
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement>>();

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
  public readonly raw: Record<string, unknown>;

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
    this.attributes = data.attributes ?? {};
    this.aiTags = data.aiTags ?? [];
    this.aiAnalysis = data.aiAnalysis;
    this.raw = data.raw ?? {};
  }

  get primaryImage(): MediaItem | undefined {
    return this.media?.[0];
  }

  get imageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'https://via.placeholder.com/256?text=No+Image';

    // Prefer Storage API for optimized images (150px WebP)
    if (media.storage_id) {
      return `https://api-storage.arkturian.com/storage/media/${media.storage_id}?width=150&format=webp&quality=75`;
    }

    // Fallback to Shopify CDN
    return media.src;
  }

  get fullImageUrl(): string {
    const media = this.primaryImage;
    if (!media?.src) return 'https://via.placeholder.com/800?text=No+Image';

    // Prefer Storage API for optimized images (800px WebP)
    if (media.storage_id) {
      return `https://api-storage.arkturian.com/storage/media/${media.storage_id}?width=800&format=webp&quality=85`;
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

  getAttribute(key: string): ProductAttribute | undefined {
    return this.attributes[key];
  }

  getAttributeValue<T = string | number | boolean | null>(key: string): T | undefined {
    return this.attributes[key]?.value as T | undefined;
  }

  async loadImage(): Promise<HTMLImageElement | null> {
    const url = this.imageUrl;
    return this.loadImageFromUrl(url);
  }

  /**
   * Load image from a specific URL (for LOD system)
   */
  async loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
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

    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // Don't set crossOrigin - not needed unless we're using Canvas
      // img.crossOrigin = 'anonymous';

      img.onload = () => {
        // SUCCESS: Update to new image
        this._image = img;
        this._imageLoading = false;
        Product.imageCache.set(url, img);
        Product.loadingPromises.delete(url);
        resolve(img);
      };

      img.onerror = () => {
        this._imageLoading = false;
        this._imageError = true;
        Product.loadingPromises.delete(url);
        console.warn(`Failed to load image for product ${this.id}: ${url} (keeping existing image)`);

        // IMPORTANT: Keep existing image on error, don't replace with null!
        // this._image stays unchanged

        reject(new Error(`Image load failed: ${url}`));
      };

      img.src = url;
    });

    Product.loadingPromises.set(url, loadPromise);

    try {
      return await loadPromise;
    } catch {
      // On error, return current image (might be lower res, but better than nothing)
      return this._image;
    }
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
