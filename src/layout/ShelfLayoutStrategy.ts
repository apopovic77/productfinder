import { Vector2 } from 'arkturian-typescript-utils';
import { LayoutNode } from './LayoutNode';

/**
 * ShelfLayoutStrategy implements a "shelf" or "bottom-aligned" layout.
 * 
 * Inspired by Microsoft Pivot Collection and WPF ProductFinder:
 * - Products are placed on a virtual "shelf" (bottom-aligned)
 * - Larger/heavier products are taller
 * - Products are arranged left-to-right
 * - Multiple rows if needed (wrapping)
 * 
 * Similar to DoLayoutRectangular in C# ProductFinderPanel
 */
export class ShelfLayoutStrategy<T> {
  spacingX = 12;
  spacingY = 20;
  maxRowWidth?: number;

  /**
   * Layout products on shelves (bottom-aligned rows)
   * 
   * @param frameX Left edge of the frame
   * @param frameYBottom Bottom edge of the frame (shelf baseline)
   * @param frameWidth Width of the frame
   * @param nodes Products to layout
   * @param baseH Base height for products
   * @param scaleOf Function to get scale factor for each product
   */
  layout(
    frameX: number, 
    frameYBottom: number, 
    frameWidth: number, 
    nodes: LayoutNode<T>[], 
    baseH: number, 
    scaleOf: (n: LayoutNode<T>) => number
  ) {
    if (nodes.length === 0) return;

    // Calculate actual sizes for all products
    const productSizes = nodes.map(n => {
      const scale = scaleOf(n);
      const h = baseH * scale;
      const w = h; // Square aspect ratio
      return { node: n, width: w, height: h, scale };
    });

    // Layout in rows (shelves)
    let currentX = frameX;
    let currentShelfY = frameYBottom;
    let currentRowMaxHeight = 0;
    let currentRowProducts: typeof productSizes = [];

    const placeRow = () => {
      if (currentRowProducts.length === 0) return;

      // Place products on current shelf (bottom-aligned)
      let x = frameX;
      for (const p of currentRowProducts) {
        const y = currentShelfY - p.height; // Bottom-aligned!
        p.node.setTargets(
          new Vector2(x, y),
          new Vector2(p.width, p.height),
          1,
          p.scale
        );
        x += p.width + this.spacingX;
      }

      // Move to next shelf (up)
      currentShelfY -= (currentRowMaxHeight + this.spacingY);
      currentRowProducts = [];
      currentRowMaxHeight = 0;
    };

    // Process each product
    for (const p of productSizes) {
      const nextX = currentX + p.width;

      // Check if product fits in current row
      if (currentRowProducts.length > 0 && nextX > frameX + frameWidth) {
        // Row is full - place it and start new row
        placeRow();
        currentX = frameX;
      }

      // Add product to current row
      currentRowProducts.push(p);
      currentX += p.width + this.spacingX;
      currentRowMaxHeight = Math.max(currentRowMaxHeight, p.height);
    }

    // Place last row
    placeRow();
  }
}

