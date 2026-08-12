export type SelectedProductGlowGeometry = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
};

/**
 * Elliptical Lightroom-style radial mask around the selected product.
 * The small overscan keeps the edge soft while preserving the side views.
 */
export function calculateSelectedProductGlow(
  x: number,
  y: number,
  width: number,
  height: number,
): SelectedProductGlowGeometry {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  return {
    centerX: x + safeWidth / 2,
    centerY: y + safeHeight / 2,
    radiusX: safeWidth * 0.68,
    radiusY: safeHeight * 0.62,
  };
}
