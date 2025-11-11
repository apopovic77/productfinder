/**
 * LOD (Level of Detail) Configuration
 * Configure dynamic image loading behavior for the product finder
 */
export const LOD_CONFIG = {
  // Enable/disable dynamic image loading
  enabled: true,

  // Update frequencies (in milliseconds)
  scanInterval: 500,         // How often to scan for needed images (2 FPS = 500ms)
  processInterval: 100,      // How often to process the load queue (10 FPS = 100ms)

  // Image resolutions (max dimension - longest side will be this size)
  lowResolution: 130,        // Low quality image size (px)
  highResolution: 1300,      // High quality image size (px)

  // Transition point (screen space size in pixels) with hysteresis
  transitionThresholdUp: 420,    // Switch to high-res when growing > 420px
  transitionThresholdDown: 380,  // Switch to low-res when shrinking < 380px
  transitionThreshold: 400,      // @deprecated - kept for compatibility

  // Load rate limiting
  maxLoadsPerCycle: 1,       // Max images to load per process cycle (30 images/sec at 10 FPS)

  // Image quality settings
  lowQuality: 75,            // Quality for low resolution images (1-100)
  highQuality: 85,           // Quality for high resolution images (1-100)
};

export type LODConfig = typeof LOD_CONFIG;
