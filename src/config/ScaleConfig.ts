/**
 * Scale (size) configuration for product tiles.
 * Controls whether weight-based scaling is active and its clamp range.
 *
 * Mode options:
 * - true: Always enabled (both pivot and hero mode)
 * - false: Always disabled
 * - 'auto': Disabled in pivot mode, enabled in hero mode
 */
export const SCALE_CONFIG = {
  // Master switch for all scaling features
  // true = always on, false = always off, 'auto' = on in hero mode only
  // Disabled to prevent product enlargement in hero mode
  enabled: false as boolean | 'auto',

  // Weight-based scaling: light items smaller, heavy items larger
  weight: {
    enabled: false as boolean | 'auto',  // Disabled to keep all products same size
    clampMin: 0.6,   // minimum scale factor
    clampMax: 1.8,   // maximum scale factor
  },
};

export type ScaleConfig = typeof SCALE_CONFIG;

/**
 * Resolve scale enabled state based on hero mode
 * @param configValue - The config value (true/false/'auto')
 * @param isHeroMode - Whether we're in hero mode
 * @returns Resolved boolean value
 */
export function resolveScaleEnabled(configValue: boolean | 'auto', isHeroMode: boolean): boolean {
  if (configValue === 'auto') {
    return isHeroMode;  // auto = disabled in pivot, enabled in hero
  }
  return configValue;
}


