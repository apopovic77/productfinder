import type { Product } from '../types/Product';

/**
 * Get all images (hero + gallery) for a specific variant
 */
export function getImagesForVariant(
  product: Product,
  variant: any
): Array<{ storageId: number; role: string; src: string }> {
  const images: Array<{ storageId: number; role: string; src: string }> = [];

  if (!variant?.name) {
    return images;
  }

  // Extract color from variant name (e.g., "Gray / 28" → "gray")
  const variantColor = variant.name.split('/')[0]?.trim().toLowerCase();
  if (!variantColor) {
    return images;
  }

  const media = product.media || [];

  // Match images by filename (src URL contains color)
  for (const m of media) {
    const storageId = (m as any).storage_id;
    if (!storageId) continue;

    const src = m.src || '';
    const srcLower = src.toLowerCase();

    // Check if filename contains the variant color
    // e.g., "2022_ONeal_LEGACY_20V.22_gray_front.png" matches "gray"
    if (srcLower.includes(`_${variantColor}_`) || srcLower.includes(`-${variantColor}-`)) {
      images.push({
        storageId,
        role: m.role || 'gallery',
        src: m.src || ''
      });
    }
  }

  // Sort by role (hero first, then gallery)
  images.sort((a, b) => {
    if (a.role === 'hero') return -1;
    if (b.role === 'hero') return 1;
    return a.storageId - b.storageId;
  });

  return images;
}

/**
 * Get the primary/hero variant for a product (first variant or first with image)
 */
export function getPrimaryVariant(product: Product): any | null {
  const variants = (product as any).variants || [];

  // Find first variant with image_storage_id
  const withImage = variants.find((v: any) => v.image_storage_id);
  if (withImage) return withImage;

  // Fallback to first variant
  return variants[0] || null;
}

/**
 * Group variants by color (first part of name, e.g., "Schwarz/Türkisblau / S" → "Schwarz/Türkisblau")
 */
export function getVariantColor(variant: any): string {
  if (!variant?.name) return '';

  // Split by "/" and take first two parts (color combination)
  const parts = variant.name.split('/').map((s: string) => s.trim());
  return parts.slice(0, 2).join('/');
}

/**
 * Get unique color variants (one representative per color)
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
