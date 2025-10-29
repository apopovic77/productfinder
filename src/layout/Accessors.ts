import type { Product } from '../types/Product';

/**
 * Layout accessors - delegate to Product class methods
 */
export class ProductLayoutAccessors {
  groupKey(p: Product): string { 
    const brandAttr = p.getAttributeValue('brand');
    const categoryAttr = p.getAttributeValue('category');
    return String(brandAttr ?? categoryAttr ?? p.brand ?? p.category?.[0] ?? 'Unknown'); 
  }
  
  weight(p: Product): number | undefined { 
    return p.weight;
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
    return p.displayName ?? p.name; 
  }
  
  priceText(p: Product): string { 
    return p.priceText;
  }
}




