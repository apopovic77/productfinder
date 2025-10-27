import { Vector2 } from 'arkturian-typescript-utils';
import { LayoutNode } from './LayoutNode';
import type { GridConfig } from './SmartGridLayoutStrategy';

/**
 * MasonryLayoutStrategy implements dense packing with varied sizes.
 * 
 * Similar to Pinterest/Masonry layout:
 * - Products have different sizes based on weight/scale
 * - Packed densely to minimize gaps
 * - Fills columns evenly (shortest column first)
 */
export class MasonryLayoutStrategy<T> {
  constructor(private config: GridConfig) {}

  /**
   * Layout products in masonry style (dense packing)
   */
  layout(
    viewportWidth: number,
    viewportHeight: number,
    nodes: LayoutNode<T>[],
    scaleOf: (n: LayoutNode<T>) => number
  ): void {
    if (nodes.length === 0) return;

    // Calculate available space
    const availableWidth = viewportWidth - 2 * this.config.margin;

    // Determine number of columns (fixed)
    const baseCellSize = 150; // Base size for calculation
    const cols = Math.max(2, Math.floor((availableWidth + this.config.spacing) / (baseCellSize + this.config.spacing)));

    // Calculate column width
    const columnWidth = (availableWidth - (cols - 1) * this.config.spacing) / cols;

    // Track height of each column
    const columnHeights = new Array(cols).fill(this.config.margin);

    // Place each product in shortest column
    nodes.forEach(node => {
      // Find shortest column
      const shortestCol = columnHeights.indexOf(Math.min(...columnHeights));

      // Calculate product size based on scale
      const scale = scaleOf(node);
      const productSize = Math.max(
        this.config.minCellSize,
        Math.min(columnWidth, this.config.maxCellSize * scale)
      );

      // Position in shortest column
      const x = this.config.margin + shortestCol * (columnWidth + this.config.spacing);
      const y = columnHeights[shortestCol];

      node.setTargets(
        new Vector2(x, y),
        new Vector2(productSize, productSize),
        1,
        scale
      );

      // Update column height
      columnHeights[shortestCol] += productSize + this.config.spacing;
    });
  }
}

