import { Vector2 } from 'arkturian-typescript-utils';
import { LayoutNode } from './LayoutNode';

export type GridConfig = {
  spacing: number;      // Space between products
  margin: number;       // Margin to viewport edges
  minCellSize: number;  // Minimum product size
  maxCellSize: number;  // Maximum product size
};

/**
 * SmartGridLayoutStrategy intelligently calculates optimal product size
 * to fit all products perfectly in the viewport.
 * 
 * Algorithm:
 * 1. Calculate available space (viewport - margins)
 * 2. Determine optimal columns based on product count
 * 3. Calculate cell size to fill space perfectly
 * 4. Distribute products in perfect matrix grid
 */
export class SmartGridLayoutStrategy<T> {
  constructor(private config: GridConfig) {}

  /**
   * Calculate optimal number of columns based on product count and aspect ratio
   */
  private calculateOptimalColumns(
    productCount: number, 
    availableWidth: number, 
    availableHeight: number
  ): number {
    if (productCount === 0) return 1;
    if (productCount === 1) return 1;

    // Start with a reasonable estimate based on available width
    const estimatedCols = Math.floor(availableWidth / (this.config.minCellSize + this.config.spacing));
    const maxCols = Math.min(productCount, Math.max(2, estimatedCols));
    
    // Try different column counts and find best fit
    let bestCols = Math.max(2, Math.floor(Math.sqrt(productCount))); // Start with sqrt as baseline
    let bestScore = Infinity;

    for (let cols = 2; cols <= maxCols; cols++) {
      const rows = Math.ceil(productCount / cols);
      
      // Calculate cell size for this layout
      const cellWidth = (availableWidth - (cols - 1) * this.config.spacing) / cols;
      const cellHeight = (availableHeight - (rows - 1) * this.config.spacing) / rows;
      
      const cellSize = Math.min(cellWidth, cellHeight);
      
      // Prefer layouts where cell size is reasonable
      // Don't skip if out of bounds, just score it worse
      let score = 0;
      
      // Penalty for being outside size constraints
      if (cellSize < this.config.minCellSize) {
        score += (this.config.minCellSize - cellSize) * 2;
      } else if (cellSize > this.config.maxCellSize) {
        score += (cellSize - this.config.maxCellSize) * 0.5;
      }
      
      // Prefer more columns (better use of horizontal space)
      score += (maxCols - cols) * 10;
      
      // Prefer square-ish aspect ratios
      const aspectRatio = cellWidth / cellHeight;
      score += Math.abs(aspectRatio - 1.0) * 20;

      if (score < bestScore) {
        bestScore = score;
        bestCols = cols;
      }
    }

    return Math.max(2, bestCols); // Always at least 2 columns
  }

  /**
   * Layout products in a perfect matrix grid
   */
  layout(
    viewportWidth: number,
    viewportHeight: number,
    nodes: LayoutNode<T>[],
    scaleOf?: (n: LayoutNode<T>) => number
  ): void {
    if (nodes.length === 0) return;

    // Calculate available space
    const availableWidth = viewportWidth - 2 * this.config.margin;
    const availableHeight = viewportHeight - 2 * this.config.margin;

    // Calculate optimal columns
    const cols = this.calculateOptimalColumns(nodes.length, availableWidth, availableHeight);
    const rows = Math.ceil(nodes.length / cols);

    // Calculate cell size to fit perfectly
    const cellWidth = (availableWidth - (cols - 1) * this.config.spacing) / cols;
    const cellHeight = (availableHeight - (rows - 1) * this.config.spacing) / rows;
    const cellSize = Math.min(
      Math.max(this.config.minCellSize, Math.min(cellWidth, cellHeight)),
      this.config.maxCellSize
    );

    // Center the grid if it doesn't fill the viewport
    const totalGridWidth = cols * cellSize + (cols - 1) * this.config.spacing;
    const totalGridHeight = rows * cellSize + (rows - 1) * this.config.spacing;
    const startX = this.config.margin + (availableWidth - totalGridWidth) / 2;
    const startY = this.config.margin + (availableHeight - totalGridHeight) / 2;

    // Place products in grid
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const x = startX + col * (cellSize + this.config.spacing);
      const y = startY + row * (cellSize + this.config.spacing);

      const scale = scaleOf ? scaleOf(node) : 1;

      node.setTargets(
        new Vector2(x, y),
        new Vector2(cellSize, cellSize),
        1,
        scale
      );
    });
  }
}

