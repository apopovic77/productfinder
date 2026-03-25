/**
 * LOD (Level of Detail) Configuration
 * 3-tier dynamic image loading: micro → low → high
 */
export const LOD_CONFIG = {
  enabled: true,

  // Update frequencies (in milliseconds)
  scanInterval: 500,
  processInterval: 100,

  // Image resolutions (3 tiers)
  microResolution: 35,       // Micro thumbnail — initial load, overview
  lowResolution: 130,        // Normal thumbnail — zoomed in
  highResolution: 1300,      // Full detail — hero/close-up

  // Transition thresholds (screen space size in pixels) with hysteresis
  // micro → low
  microToLowUp: 80,          // Switch to low when screen size > 80px
  microToLowDown: 60,        // Switch back to micro when < 60px
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
  lowQuality: 75,
  highQuality: 85,
};

export type LODConfig = typeof LOD_CONFIG;
