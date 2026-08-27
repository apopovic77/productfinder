import type { Product, ProductVariant } from '../types/Product';

/**
 * Get all images (hero + gallery) for a specific variant.
 * Supports V2 API (variant.images[], variant.storage) and V1 (name-based matching).
 */
export function getImagesForVariant(
  product: Product,
  variant: any
): Array<{ storageId: number; role: string; src: string }> {
  const images: Array<{ storageId: number; role: string; src: string }> = [];

  // V2 API: variant has images[] array with storage objects
  if (variant?.images && Array.isArray(variant.images)) {
    for (const img of variant.images) {
      const storageId = img.storage?.id;
      if (storageId) {
        images.push({
          storageId,
          role: img.role || 'gallery',
          src: img.image_path || '',
        });
      }
    }
  }

  // V2 API: variant has direct storage (hero image)
  if (images.length === 0 && variant?.storage?.id) {
    images.push({
      storageId: variant.storage.id,
      role: 'hero',
      src: variant.image_path || '',
    });
  }

  // V2 API: variant has image_storage_id
  if (images.length === 0 && variant?.image_storage_id) {
    images.push({
      storageId: variant.image_storage_id,
      role: 'hero',
      src: '',
    });
  }

  // V1 fallback: match by variant name in product media
  if (images.length === 0 && variant?.name) {
    const variantColor = variant.name.split('/')[0]?.trim().toLowerCase();
    if (variantColor) {
      const media = product.media || [];
      for (const m of media) {
        const storageId = (m as any).storage_id;
        if (!storageId) continue;
        const srcLower = (m.src || '').toLowerCase();
        if (srcLower.includes(`_${variantColor}_`) || srcLower.includes(`-${variantColor}-`)) {
          images.push({ storageId, role: m.role || 'gallery', src: m.src || '' });
        }
      }
    }
  }

  // Sort: hero first, then by storageId
  images.sort((a, b) => {
    if (a.role === 'hero') return -1;
    if (b.role === 'hero') return 1;
    return a.storageId - b.storageId;
  });

  return images;
}

/**
 * Get the primary/hero variant for a product.
 */
export function getPrimaryVariant(product: Product): any | null {
  const variants = (product as any).variants || [];

  // V2: find first variant with storage or image_storage_id
  const withStorage = variants.find((v: any) => v.storage?.id || v.image_storage_id);
  if (withStorage) return withStorage;

  return variants[0] || null;
}

/**
 * Get variant color string.
 * V2 API: uses variant.color or variant.description_short.
 * V1: parses from variant.name.
 */
export function getVariantColor(variant: any): string {
  if (variant?.color) return String(variant.color);
  if (variant?.description_short) return String(variant.description_short);
  if (!variant?.name) return '';
  const parts = variant.name.split('/').map((s: string) => s.trim());
  return parts.slice(0, 2).join('/');
}

/**
 * Get unique color variants (one representative per color).
 */
export function getUniqueColorVariants(product: Product): any[] {
  const variants = (product as any).variants || [];
  const colorMap = new Map<string, any>();

  for (const variant of variants) {
    const color = getVariantColor(variant);
    if (color && !colorMap.has(color)) {
      colorMap.set(color, variant);
    }
  }

  return Array.from(colorMap.values());
}


/**
 * Base color of a variant — the plain color value ("black", "red/blue").
 * Semantics of the standard (V2) overlay dialog.
 * Order: v2 `color` field → legacy Shopify option2/option1 → name parse.
 */
export function getVariantBaseColor(variant: ProductVariant | any): string {
  if (variant.color) return String(variant.color);
  if (variant.option2) return String(variant.option2);
  if (variant.option1) return String(variant.option1);
  const parts = (variant.name || variant.description_short || '').split(' / ').map((s: string) => s.trim());
  return parts[0] || variant.sku || 'Default';
}

/**
 * Design/graphic name of a variant ("PRODIGY black", "RACE Carbon").
 * Semantics of the hero (V4) dialog — deliberately different from
 * getVariantBaseColor: description_short distinguishes design variants
 * that share the same base color.
 */
export function getVariantDesignName(variant: ProductVariant | any): string {
  if (variant.description_short) return String(variant.description_short);
  if (variant.color) return String(variant.color);
  if (variant.option2) return String(variant.option2);
  if (variant.option1) return String(variant.option1);
  const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
  return parts[0] || variant.sku || 'Default';
}

/**
 * Size of a variant. Shared by V2 and V4 dialogs.
 * Order: v2 `size` field → legacy option heuristics → name parse.
 */
export function getVariantSize(variant: ProductVariant | any): string {
  if (variant.size) return String(variant.size);
  if (variant.option1 && !variant.option2) return String(variant.option1);
  if (variant.option1 && variant.option2) {
    const opt1 = String(variant.option1);
    if (/^\d+$/.test(opt1) || opt1.length <= 3) return opt1;
    return '';
  }
  const parts = (variant.name || '').split(' / ').map((s: string) => s.trim());
  return parts[1] || '';
}

/**
 * Project only the two values represented by the variant chips into the
 * Realtime browser contract. The display helpers may fall back to a SKU when
 * catalog colour data is missing; that fallback must never cross this port.
 */
export function getRealtimeVariantContext(
  variant: Partial<ProductVariant> | null | undefined,
): { size?: string; color?: string } | null {
  if (!variant) return null;
  const size = getVariantSize(variant).trim();
  const rawColor = getVariantBaseColor(variant).trim();
  const sku = String(variant.sku ?? '').trim();
  const color = rawColor && rawColor !== 'Default' && rawColor !== sku ? rawColor : '';
  if (!size && !color) return null;
  return { ...(size ? { size } : {}), ...(color ? { color } : {}) };
}
