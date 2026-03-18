import type { Product } from '../types/Product';

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
