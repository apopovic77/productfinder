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
   * Calculate optimal number of columns to fit ALL products on screen
   */
  private calculateOptimalColumns(
    productCount: number, 
    availableWidth: number, 
    availableHeight: number
  ): number {
    if (productCount === 0) return 1;
    if (productCount === 1) return 1;

    // Start with square root as baseline (most balanced layout)
    let bestCols = Math.max(2, Math.ceil(Math.sqrt(productCount)));
    let bestScore = Infinity;

    // Try different column counts
    const minCols = 2;
    const maxCols = productCount;

    for (let cols = minCols; cols <= maxCols; cols++) {
      const rows = Math.ceil(productCount / cols);
      
      // Calculate cell size for this layout
      const cellWidth = (availableWidth - (cols - 1) * this.config.spacing) / cols;
      const cellHeight = (availableHeight - (rows - 1) * this.config.spacing) / rows;
      
      // Cell size is limited by the smaller dimension
      const cellSize = Math.min(cellWidth, cellHeight);
      
      // Skip if cell size is too small to be usable
      if (cellSize < 50) continue;
      
      // Score based on:
      // 1. How well it fills the screen (prefer larger cells)
      // 2. How balanced the grid is (prefer square-ish layouts)
      // 3. Prefer cells within the configured size range
      
      let score = 0;
      
      // Prefer larger cells (better visibility)
      score += (300 - cellSize) * 0.5;
      
      // Prefer balanced layouts (aspect ratio close to 1)
      const gridAspect = (cols * cellSize) / (rows * cellSize);
      score += Math.abs(gridAspect - 1.0) * 50;
      
      // Prefer cells within the configured range (but don't enforce it)
      if (cellSize < this.config.minCellSize) {
        score += (this.config.minCellSize - cellSize) * 0.1;
      } else if (cellSize > this.config.maxCellSize) {
        score += (cellSize - this.config.maxCellSize) * 0.1;
      }

      if (score < bestScore) {
        bestScore = score;
        bestCols = cols;
      }
    }

    return bestCols;
  }

  /**
   * Layout products in a perfect matrix grid - ALL products fit on screen!
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

    // Calculate optimal columns to fit ALL products
    const cols = this.calculateOptimalColumns(nodes.length, availableWidth, availableHeight);
    const rows = Math.ceil(nodes.length / cols);

    // Calculate cell size to fit ALL products perfectly
    // This ensures everything is visible without scrolling
    const cellWidth = (availableWidth - (cols - 1) * this.config.spacing) / cols;
    const cellHeight = (availableHeight - (rows - 1) * this.config.spacing) / rows;
    
    // Use the smaller dimension to ensure square cells that fit
    let cellSize = Math.min(cellWidth, cellHeight);
    
    // Only apply constraints as soft limits (prefer but don't enforce)
    // This ensures ALL products are visible even if cells are smaller than minCellSize
    if (cellSize < 50) {
      console.warn(`Cell size ${cellSize}px is very small for ${nodes.length} products. Consider filtering.`);
    }

    // Center the grid
    const totalGridWidth = cols * cellSize + (cols - 1) * this.config.spacing;
    const totalGridHeight = rows * cellSize + (rows - 1) * this.config.spacing;
    const startX = this.config.margin + (availableWidth - totalGridWidth) / 2;
    const startY = this.config.margin + (availableHeight - totalGridHeight) / 2;

    console.log(`Grid: ${cols}x${rows}, Cell: ${cellSize.toFixed(1)}px, Total: ${nodes.length} products`);

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

