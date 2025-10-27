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
   * Converts Shopify CDN URLs to smaller thumbnail versions
   * e.g., _1200x.png → _400x.png for better performance
   */
  imageUrl(p: Product): string { 
    const originalUrl = p.media?.[0]?.src;
    if (!originalUrl) return 'https://via.placeholder.com/256?text=No+Image';
    
    // Optimize Shopify CDN images
    // Replace _1200x, _800x, etc. with _400x for grid thumbnails
    if (originalUrl.includes('oneal.eu/cdn/shop/files/')) {
      return originalUrl.replace(/_\d+x\.(png|jpg|jpeg|webp)/i, '_400x.$1');
    }
    
    // For other CDNs, return original URL
    return originalUrl;
  }
  
  /**
   * Get full-size image URL for modal/detail view
   */
  fullImageUrl(p: Product): string {
    return p.media?.[0]?.src || 'https://via.placeholder.com/800?text=No+Image';
  }
  
  priceText(p: Product): string { return p.price?.formatted || ''; }
}




