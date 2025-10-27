import type { Product } from '../types/Product';

/**
 * Layout accessors - delegate to Product class methods
 */
export class ProductLayoutAccessors {
  groupKey(p: Product): string { 
    return p.brand || (p.category?.[0] || 'Unknown'); 
  }
  
  weight(p: Product): number | undefined { 
    return p.weight; // Delegates to Product.weight getter
  }
  
  aspect(p: Product): number | undefined { 
    return 1; 
  }
  
  sizeHint(p: Product) { 
    return { baseW: 1, baseH: 1, aspect: 1 }; 
  }
}

/**
 * Render accessors - delegate to Product class methods
 */
export class ProductRenderAccessors {
  label(p: Product): string { 
    return p.name; 
  }
  
  priceText(p: Product): string { 
    return p.priceText; // Delegates to Product.priceText getter
  }
}




