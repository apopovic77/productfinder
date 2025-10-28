export type Price = { 
  currency?: string; 
  value: number; 
  formatted: string 
};

export type MediaItem = { 
  src: string;
  alt?: string;
  type?: string;
};

export type ProductSpecifications = {
  weight?: number;
  dimensions?: string;
  shell_material?: string;
  liner_material?: string;
  [key: string]: any;
};

export type ProductData = {
  id: string;
  sku?: string;
  name: string;
  brand?: string;
  category: string[];
  season?: number;
  price?: Price;
  media?: MediaItem[];
  specifications?: ProductSpecifications;
  meta?: Record<string, any>;
};

/**
 * OOP Product class with self-managed image loading
 */
export class Product {
  // Static image cache shared across all products
  private static imageCache = new Map<string, HTMLImageElement>();
  private static loadingPromises = new Map<string, Promise<HTMLImageElement>>();
  
  // Instance properties
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
  
  // Image state (self-managed)
  private _image: HTMLImageElement | null = null;
  private _imageLoading = false;
  private _imageError = false;
  
  constructor(data: ProductData) {
    this.id = data.id;
    this.sku = data.sku;
    this.name = data.name;
    this.brand = data.brand;
    this.category = data.category;
    this.season = data.season;
    this.price = data.price;
    this.media = data.media;
    this.specifications = data.specifications;
    this.meta = data.meta;
  }
  
  /**
   * Get the primary image URL
   * Uses original Shopify CDN URLs directly (no proxy needed)
   */
  get imageUrl(): string {
    const media = this.media?.[0];
    if (!media?.src) return 'https://via.placeholder.com/256?text=No+Image';
    
    return this.getSizedImageUrl(media.src, 320);
  }
  
  /**
   * Get full-size image URL for detail view
   * Uses original Shopify CDN URLs directly
   */
  get fullImageUrl(): string {
    const media = this.media?.[0];
    if (!media?.src) return 'https://via.placeholder.com/800?text=No+Image';
    
    // Return original Shopify CDN URL directly
    return media.src;
  }
  
  /**
   * Get weight from specifications
   */
  get weight(): number | undefined {
    return this.specifications?.weight;
  }
  
  /**
   * Get formatted price text
   */
  get priceText(): string {
    return this.price?.formatted || '';
  }
  
  /**
   * Load the product image (async, self-managed)
   */
  async loadImage(): Promise<HTMLImageElement | null> {
    const url = this.imageUrl;
    
    // Return cached image if available
    if (Product.imageCache.has(url)) {
      this._image = Product.imageCache.get(url)!;
      return this._image;
    }
    
    // Return existing loading promise if already loading
    if (Product.loadingPromises.has(url)) {
      return Product.loadingPromises.get(url)!;
    }
    
    // Start loading
    this._imageLoading = true;
    this._imageError = false;
    
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
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
        console.warn(`Failed to load image for product ${this.id}: ${url}`);
        reject(new Error(`Image load failed: ${url}`));
      };
      
      img.src = url;
    });
    
    Product.loadingPromises.set(url, loadPromise);
    
    try {
      return await loadPromise;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Get the loaded image (synchronous, returns null if not loaded)
   */
  get image(): HTMLImageElement | null {
    return this._image;
  }
  
  /**
   * Check if image is ready to render
   */
  get isImageReady(): boolean {
    return this._image !== null && 
           this._image.complete && 
           this._image.naturalWidth > 0 &&
           !this._imageError;
  }
  
  /**
   * Check if image is currently loading
   */
  get isImageLoading(): boolean {
    return this._imageLoading;
  }
  
  /**
   * Check if image failed to load
   */
  get hasImageError(): boolean {
    return this._imageError;
  }
  
  /**
   * Static method to clear image cache (for memory management)
   */
  static clearImageCache(): void {
    Product.imageCache.clear();
    Product.loadingPromises.clear();
  }

  private getSizedImageUrl(src: string, size: number): string {
    if (size <= 0) return src;
    try {
      const url = new URL(src);
      if (url.hostname.includes('api-storage.arkturian.com')) {
        const params = url.searchParams;
        params.set('width', String(size));
        params.set('format', 'webp');
        params.set('quality', '70');
        url.search = params.toString();
        return url.toString();
      }
      if (!url.hostname.includes('cdn.shopify.com')) {
        return src;
      }
      
      const path = url.pathname;
      const lastDot = path.lastIndexOf('.');
      if (lastDot === -1) {
        return src;
      }
      
      const base = path.slice(0, lastDot).replace(/_(\d+x\d+|pico|icon|thumb|small|compact|medium|large|grande|master)$/, '');
      const ext = path.slice(lastDot);
      url.pathname = `${base}_${size}x${size}${ext}`;
      return url.toString();
    } catch {
      return src;
    }
  }
  /**
   * Static method to preload images for multiple products
   */
  static async preloadImages(products: Product[]): Promise<void> {
    await Promise.allSettled(products.map(p => p.loadImage()));
  }
}
