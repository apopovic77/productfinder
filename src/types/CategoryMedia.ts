/**
 * Category Media Types
 *
 * Defines media assets for product categories, dimensions, and groups.
 * Used for hero images, backgrounds, and promotional content.
 */

export type CategoryMediaType = 'image' | 'video';

export type CategoryMediaRole = 'hero' | 'background' | 'thumbnail';

/**
 * Media asset for a specific category or dimension value
 */
export type CategoryMedia = {
  id: string;
  dimension: string;           // e.g., 'category:presentation', 'attribute:product_family'
  dimensionValue: string;      // e.g., 'Helme', 'JERSEYS'
  mediaType: CategoryMediaType;
  storageId: number;          // Storage Media ID
  role: CategoryMediaRole;
  title?: string;
  description?: string;
  priority?: number;          // For sorting/ranking
  meta?: Record<string, any>;
};

/**
 * JSON structure for category-media.json
 */
export type CategoryMediaData = {
  version: string;
  description?: string;
  media: CategoryMedia[];
};

/**
 * Media lookup key for fast retrieval
 */
export type MediaLookupKey = `${string}:${string}`; // "dimension:dimensionValue"
