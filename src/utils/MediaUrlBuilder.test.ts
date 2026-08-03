import { describe, expect, it } from 'vitest';
import { LOD_CONFIG } from '../config/LODConfig';
import { WEB_PRODUCT_IMAGE_PRESETS, WEB_THUMBNAIL_WARMUP } from '../config/imagePresets';
import { buildHighResUrl, buildThumbnailUrl } from './MediaUrlBuilder';

describe('canonical Productfinder image presets', () => {
  it('uses the same 180px/q80 preset for preload, grid and low LOD', () => {
    const thumbnail = new URL(buildThumbnailUrl(123), 'https://productfinder.test');

    expect(thumbnail.searchParams.get('width')).toBe('180');
    expect(thumbnail.searchParams.get('quality')).toBe('80');
    expect(thumbnail.searchParams.get('format')).toBe('webp');
    expect(thumbnail.searchParams.get('trim')).toBe('true');
    expect(LOD_CONFIG.lowResolution).toBe(WEB_PRODUCT_IMAGE_PRESETS.grid.width);
    expect(LOD_CONFIG.lowQuality).toBe(WEB_PRODUCT_IMAGE_PRESETS.grid.quality);
  });

  it('keeps the high-resolution hero preset separate from thumbnails', () => {
    const hero = new URL(buildHighResUrl(123), 'https://productfinder.test');

    expect(hero.searchParams.get('width')).toBe('1300');
    expect(hero.searchParams.get('quality')).toBe('85');
  });

  it('keeps background warmup below every interactive image priority', () => {
    expect(WEB_THUMBNAIL_WARMUP.blockingCount).toBeGreaterThan(0);
    expect(WEB_THUMBNAIL_WARMUP.backgroundPriority).toBeGreaterThan(10_000);
  });
});
