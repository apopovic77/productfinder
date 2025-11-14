/**
 * Footer Position Configuration
 *
 * Configures the position and behavior of the footer panel.
 * The footer can be displayed in different modes to optimize screen space.
 */

export type FooterPosition = 'bottom' | 'right' | 'left' | 'floating';

export const FOOTER_CONFIG = {
  /**
   * Footer position mode
   * - 'bottom': Fixed at bottom
   * - 'right': Sidebar on the right side (default)
   * - 'left': Sidebar on the left side
   * - 'floating': Draggable dialog that can be moved anywhere
   */
  position: 'right' as FooterPosition,

  /**
   * Bottom mode configuration
   */
  bottom: {
    height: 'auto', // Auto height based on content
    padding: '18px 28px',
    backgroundColor: 'transparent',
  },

  /**
   * Right sidebar mode configuration
   */
  right: {
    width: 300, // Width in pixels
    padding: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },

  /**
   * Left sidebar mode configuration
   */
  left: {
    width: 300, // Width in pixels
    padding: '20px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },

  /**
   * Floating dialog mode configuration
   */
  floating: {
    width: 320, // Width in pixels
    minHeight: 200, // Minimum height in pixels
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    borderRadius: 12,
    defaultPosition: {
      x: 20, // Default X position from left
      y: 80, // Default Y position from top
    },
    draggable: true,
    resizable: false, // Future feature: allow resizing
  },

  /**
   * Transition animation duration (ms)
   */
  transitionDuration: 300,
};
