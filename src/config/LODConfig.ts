/**
 * LOD (Level of Detail) Configuration
 * Configure dynamic image loading behavior for the product finder
 */
export const LOD_CONFIG = {
  // Enable/disable dynamic image loading
  enabled: true,

  // Update frequencies (in milliseconds)
  scanInterval: 5000,        // How often to scan for needed images (1 FPS = 1000ms)
  processInterval: 100,      // How often to process the load queue (10 FPS = 100ms)

  // Image resolutions
  lowResolution: 150,        // Low quality image size (px)
  highResolution: 1300,      // High quality image size (px)

  // Transition point (screen space size in pixels)
  transitionThreshold: 10000,  // Switch to high-res when image > 400px on screen

  // Load rate limiting
  maxLoadsPerCycle: 1,       // Max images to load per process cycle (30 images/sec at 10 FPS)

  // Image quality settings
  lowQuality: 75,            // Quality for low resolution images (1-100)
  highQuality: 85,           // Quality for high resolution images (1-100)
};

export type LODConfig = typeof LOD_CONFIG;
