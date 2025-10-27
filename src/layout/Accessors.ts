import type { Product } from '../types/Product';

export class ProductLayoutAccessors {
  groupKey(p: Product): string { return (p.brand || (p.category?.[0] || 'Unknown')); }
  weight(p: Product): number | undefined { return p.specifications?.weight; }
  aspect(p: Product): number | undefined { return 1; }
  sizeHint(p: Product) { return { baseW: 1, baseH: 1, aspect: 1 }; }
}

export class ProductRenderAccessors {
  label(p: Product): string { return p.name; }
  imageUrl(p: Product): string { return p.media?.[0]?.src || 'https://via.placeholder.com/256?text=No+Image'; }
  priceText(p: Product): string { return p.price?.formatted || ''; }
}




