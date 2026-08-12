/**
 * Canonical image presets for the live Web Productfinder.
 *
 * Cache keys include every URL parameter. Keeping these values in one place
 * prevents the preloader, initial grid and LOD renderer from requesting
 * different variants of the same thumbnail.
 */
export const WEB_PRODUCT_IMAGE_PRESETS = {
  grid: {
    width: 180,
    quality: 80,
  },
  hero: {
    width: 1300,
    quality: 85,
  },
} as const;

export const WEB_THUMBNAIL_WARMUP = {
  backgroundBatchSize: 48,
  backgroundPriority: 100_000,
  backgroundStartDelayMs: 1500,
  backgroundBatchDelayMs: 100,
} as const;
