/**
 * Scale (size) configuration for product tiles.
 * Controls whether weight-based scaling is active and its clamp range.
 */
export const SCALE_CONFIG = {
  // Master switch for all scaling features
  enabled: false,

  // Weight-based scaling: light items smaller, heavy items larger
  weight: {
    enabled: true,   // set false to disable effect completely
    clampMin: 0.8,   // minimum scale factor
    clampMax: 1.4,   // maximum scale factor
  },
};

export type ScaleConfig = typeof SCALE_CONFIG;


