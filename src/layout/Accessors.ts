import type { Product } from '../types/Product';

export class ProductLayoutAccessors {
  groupKey(p: Product): string { return (p.brand || (p.category?.[0] || 'Unknown')); }
  weight(p: Product): number | undefined { return p.specifications?.weight; }
  aspect(p: Product): number | undefined { return 1; }
  sizeHint(p: Product) { return { baseW: 1, baseH: 1, aspect: 1 }; }
}

export class ProductRenderAccessors {
  label(p: Product): string { return p.name; }
  
  /**
   * Get optimized image URL for grid display
   * 
   * ALL images now go through Storage API proxy for:
   * - WebP conversion (30-50% smaller files)
   * - Optimized quality (80% - visually lossless, much smaller)
   * - Automatic caching (24h TTL)
   * - Consistent transformation pipeline
   */
  imageUrl(p: Product): string { 
    const media = p.media?.[0];
    if (!media) return 'https://via.placeholder.com/256?text=No+Image';
    
    const originalUrl = media.src;
    if (!originalUrl) return 'https://via.placeholder.com/256?text=No+Image';
    
    // ALL images go through Storage API proxy
    // The Oneal API already returns Storage proxy URLs in the resolved format,
    // but for the standard format, we need to construct them here
    if (originalUrl.includes('api.arkturian.com/storage/proxy')) {
      // Already a proxy URL (from resolved format)
      return originalUrl;
    }
    
    // Construct Storage API proxy URL for external images
    const encodedUrl = encodeURIComponent(originalUrl);
    return `https://api.arkturian.com/storage/proxy?url=${encodedUrl}&width=400&format=webp&quality=80`;
  }
  
  /**
   * Get full-size image URL for modal/detail view
   * 
   * ALL images go through Storage API proxy for consistent delivery
   */
  fullImageUrl(p: Product): string {
    const media = p.media?.[0];
    if (!media) return 'https://via.placeholder.com/800?text=No+Image';
    
    const originalUrl = media.src;
    if (!originalUrl) return 'https://via.placeholder.com/800?text=No+Image';
    
    // ALL images go through Storage API proxy
    if (originalUrl.includes('api.arkturian.com/storage/proxy')) {
      // Already a proxy URL - just adjust parameters for full size
      return originalUrl.replace(/width=\d+/, 'width=1200').replace(/quality=\d+/, 'quality=90');
    }
    
    // Construct Storage API proxy URL for high-quality images
    const encodedUrl = encodeURIComponent(originalUrl);
    return `https://api.arkturian.com/storage/proxy?url=${encodedUrl}&width=1200&format=jpg&quality=90`;
  }
  
  priceText(p: Product): string { return p.price?.formatted || ''; }
}




