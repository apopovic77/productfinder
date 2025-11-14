import type { CategoryMedia, CategoryMediaData, MediaLookupKey } from '../types/CategoryMedia';

// API Configuration
const API_BASE = import.meta.env.VITE_ONEAL_API_BASE || 'https://oneal-api.arkturian.com/v1';
const API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

/**
 * Service for loading and managing category/group media assets
 *
 * Provides media mappings for pivot dimensions, categories, and product families.
 * Media is loaded from the O'Neal API
 */
export class CategoryMediaService {
  private mediaMap: Map<MediaLookupKey, CategoryMedia> = new Map();
  private loaded = false;
  private loading: Promise<void> | null = null;

  /**
   * Load category media from API
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;

    this.loading = this.loadInternal();
    await this.loading;
    this.loaded = true;
    this.loading = null;
  }

  private async loadInternal(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/category-media/`, {
        headers: {
          'X-API-Key': API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load category media: ${response.statusText}`);
      }

      const data: CategoryMediaData = await response.json();

      // Build lookup map
      for (const media of data.media) {
        const key = this.createLookupKey(media.dimension, media.dimensionValue);
        this.mediaMap.set(key, media);
      }

      console.log(`[CategoryMediaService] Loaded ${this.mediaMap.size} media entries`);
    } catch (error) {
      console.error('[CategoryMediaService] Failed to load category media:', error);
      throw error;
    }
  }

  /**
   * Get media for a specific dimension and value
   */
  getMedia(dimension: string, dimensionValue: string): CategoryMedia | null {
    const key = this.createLookupKey(dimension, dimensionValue);
    return this.mediaMap.get(key) ?? null;
  }

  /**
   * Get storage ID for a dimension value (convenience method)
   */
  getStorageId(dimension: string, dimensionValue: string): number | null {
    const media = this.getMedia(dimension, dimensionValue);
    return media?.storageId ?? null;
  }

  /**
   * Get hero media URL for a dimension value
   */
  getHeroImageUrl(dimension: string, dimensionValue: string, options?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  }): string | null {
    const storageId = this.getStorageId(dimension, dimensionValue);
    if (!storageId) return null;

    const { width = 400, height = 200, quality = 85, format = 'webp' } = options ?? {};

    // Use the same proxy.php as products for consistent caching
    return `https://share.arkturian.com/proxy.php?id=${storageId}&width=${width}&height=${height}&format=${format}&quality=${quality}`;
  }

  /**
   * Get hero media URL with fallback support
   * If no specific media exists, returns a random image from the fallback pool
   */
  getHeroImageUrlWithFallback(
    dimension: string,
    dimensionValue: string,
    fallbackStorageIds: number[],
    options?: {
      width?: number;
      height?: number;
      quality?: number;
      format?: string;
    }
  ): string | null {
    // Try to get specific media first
    const specificUrl = this.getHeroImageUrl(dimension, dimensionValue, options);
    if (specificUrl) return specificUrl;

    // No specific media - use fallback pool
    if (!fallbackStorageIds || fallbackStorageIds.length === 0) {
      return null;
    }

    // Select random fallback image (deterministic based on dimension value)
    const hash = this.simpleHash(dimensionValue);
    const index = hash % fallbackStorageIds.length;
    const fallbackStorageId = fallbackStorageIds[index];

    const { width = 400, height = 200, quality = 85, format = 'webp' } = options ?? {};

    return `https://share.arkturian.com/proxy.php?id=${fallbackStorageId}&width=${width}&height=${height}&format=${format}&quality=${quality}`;
  }

  /**
   * Simple hash function for deterministic random selection
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get all media for a specific dimension
   */
  getMediaForDimension(dimension: string): CategoryMedia[] {
    const result: CategoryMedia[] = [];
    for (const media of this.mediaMap.values()) {
      if (media.dimension === dimension) {
        result.push(media);
      }
    }
    return result.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  }

  /**
   * Check if media exists for dimension value
   */
  hasMedia(dimension: string, dimensionValue: string): boolean {
    return this.getMedia(dimension, dimensionValue) !== null;
  }

  /**
   * Get all loaded media entries
   */
  getAllMedia(): CategoryMedia[] {
    return Array.from(this.mediaMap.values());
  }

  /**
   * Get loaded status
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.mediaMap.clear();
    this.loaded = false;
    this.loading = null;
  }

  private createLookupKey(dimension: string, dimensionValue: string): MediaLookupKey {
    return `${dimension}:${dimensionValue}`;
  }
}

// Singleton instance
export const categoryMediaService = new CategoryMediaService();
