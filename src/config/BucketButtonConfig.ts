/**
 * Bucket Button Styling Configuration
 *
 * Central configuration for pivot group header buttons (bucket buttons)
 * in the canvas. Adjust these values to customize the appearance.
 */

export const BUCKET_BUTTON_CONFIG = {
  /**
   * Button height in pixels
   * Default: 40
   */
  height: 105,

  /**
   * Corner radius in pixels (border-radius)
   * Default: 10
   */
  cornerRadius: 0,

  /**
   * Width extension (negative margin effect)
   * Extends the button width beyond the column width on both sides.
   * This makes buttons wider than their columns, creating overlap.
   *
   * Example: If widthExtension = 20, the button will be 40px wider total
   * (20px on left side + 20px on right side)
   *
   * Set to 0 to disable (button width = column width)
   * Default: 0
   */
  widthExtension: 30
  ,

  /**
   * Font configuration
   */
  font: {
    /**
     * Font family
     * Examples: 'system-ui', 'Arial', 'Helvetica Neue', 'Inter', 'Roboto'
     */
    family: "'ITC Avant Garde Gothic', system-ui, sans-serif",

    /**
     * Font size in pixels (normal state)
     * Default: 13
     */
    sizeNormal: 20,

    /**
     * Font size in pixels (hover state)
     * Default: 14
     */
    sizeHover: 14,

    /**
     * Font weight (normal state)
     * Examples: 'normal', 'bold', '400', '500', '600', '700'
     */
    weightNormal: 'bold' as string | number,

    /**
     * Font weight (hover state)
     * Default: 'bold'
     */
    weightHover: 'bold' as string | number,

    /**
     * Text color
     * Default: 'white'
     */
    color: 'white',

    /**
     * Text transform
     * Options: 'uppercase', 'lowercase', 'capitalize', 'none'
     * Default: 'none'
     */
    textTransform: 'uppercase' as 'uppercase' | 'lowercase' | 'capitalize' | 'none',

    /**
     * Horizontal text alignment
     * Options: 'left', 'center', 'right'
     * Default: 'center'
     */
    alignHorizontal: 'right' as 'left' | 'center' | 'right',

    /**
     * Vertical text alignment
     * Options: 'top', 'center', 'bottom'
     * Default: 'center'
     */
    alignVertical: 'top' as 'top' | 'center' | 'bottom',
  },

  /**
   * Spacing and padding
   */
  spacing: {
    /**
     * Top padding inside button (in pixels)
     * Default: 20
     */
    paddingTop: 20,

    /**
     * Right padding inside button (in pixels)
     * Default: 20
     */
    paddingRight: 30,

    /**
     * Bottom padding inside button (in pixels)
     * Default: 20
     */
    paddingBottom: 20,

    /**
     * Left padding inside button (in pixels)
     * Default: 20
     */
    paddingLeft: 20,
  },

  /**
   * Hover animation
   */
  hover: {
    /**
     * Vertical offset when hovering (negative = lifts up)
     * Default: -2
     */
    yOffset: -2,

    /**
     * Shadow configuration for hover state
     */
    shadow: {
      color: 'rgba(42, 168, 239, 0.3)',
      blur: 12,
      offsetY: 4,
    },
  },

  /**
   * Hero image overlay (dark overlay over background images for text readability)
   */
  imageOverlay: {
    /**
     * Opacity when not hovering (0.0 - 1.0)
     * Higher = darker overlay
     * Default: 0.4 (40% dark)
     */
    opacityNormal: 0.4,

    /**
     * Opacity when hovering (0.0 - 1.0)
     * Default: 0.3 (30% dark)
     */
    opacityHover: 0.3,
  },

  /**
   * Fallback gradient colors (used when no hero image is available)
   */
  gradient: {
    normal: {
      start: '#1a1a1a',  // Dark black/gray
      end: '#2d2d2d',    // Slightly lighter black
    },
    hover: {
      start: '#2d2d2d',  // Lighter on hover
      end: '#404040',    // Even lighter
    },
  },

  /**
   * Fallback image pool (storage IDs)
   * Used when no category-specific hero image exists
   * A random image from this pool will be selected
   */
  fallbackImages: [
    // Add storage IDs here for fallback images
    // Example: 1234, 5678, 9012
  ] as number[],
};
