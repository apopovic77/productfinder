/**
 * LOD (Level of Detail) Configuration
 * 3-tier dynamic image loading: micro → low → high
 */
import { WEB_PRODUCT_IMAGE_PRESETS } from './imagePresets';

export const LOD_CONFIG = {
  enabled: true,

  // Update frequencies (in milliseconds)
  scanInterval: 500,
  processInterval: 100,

  // Image resolutions (3 tiers — micro currently disabled)
  microResolution: 35,       // Micro thumbnail — DISABLED (initial loads at lowResolution)
  lowResolution: WEB_PRODUCT_IMAGE_PRESETS.grid.width,
  highResolution: WEB_PRODUCT_IMAGE_PRESETS.hero.width,

  // Transition thresholds (screen space size in pixels) with hysteresis
  // micro → low (disabled: micro never used when initial load is 180px)
  microToLowUp: 0,           // Effectively disabled — always at least low
  microToLowDown: 0,
  // low → high
  lowToHighUp: 420,          // Switch to high when screen size > 420px
  lowToHighDown: 380,        // Switch back to low when < 380px

  // @deprecated - kept for compatibility
  transitionThresholdUp: 420,
  transitionThresholdDown: 380,
  transitionThreshold: 400,

  // Load rate limiting
  maxLoadsPerCycle: 1,

  // Image quality settings
  microQuality: 60,          // Quality for micro thumbnails
  lowQuality: WEB_PRODUCT_IMAGE_PRESETS.grid.quality,
  highQuality: WEB_PRODUCT_IMAGE_PRESETS.hero.quality,
};

export type LODConfig = typeof LOD_CONFIG;
