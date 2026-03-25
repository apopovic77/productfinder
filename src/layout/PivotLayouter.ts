import { LayoutNode } from './LayoutNode';
import { GridLayoutStrategy } from './GridLayoutStrategy';
import { ShelfLayoutStrategy } from './ShelfLayoutStrategy';
import { WeightScalePolicy, type ScaleContext } from './ScalePolicy';
import { SCALE_CONFIG, resolveScaleEnabled } from '../config/ScaleConfig';
import { PivotGroup } from './PivotGroup';
import { Vector2 } from 'arkturian-typescript-utils';
import { BUCKET_BUTTON_CONFIG } from '../config/BucketButtonConfig';

export type Orientation = 'rows' | 'columns';
export type Flow = 'ltr' | 'rtl' | 'ttb' | 'btt';
export type InnerLayoutType = 'grid' | 'shelf';

export type PivotConfig<T> = {
  orientation: Orientation;
  flow: Flow;
  groupKey: (t: T) => string;
  groupSort?: (a: string, b: string) => number;
  itemSort?: (a: T, b: T) => number;
  frameGap: number;
  framePadding: number; // fallback if individual paddings not set
  framePaddingTop?: number;
  framePaddingRight?: number;
  framePaddingBottom?: number;
  framePaddingLeft?: number;
  itemGap: number;
  rowBaseHeight?: number;
  colBaseWidth?: number;
  minCellSize?: number;
  maxCellSize?: number;
  cellSizeOverride?: number;  // Force cell size (skip auto-calculation)
  smallGroupThreshold?: number;
  access: { weight(item: T): number | undefined };
  scale: WeightScalePolicy;
  innerLayoutType?: InnerLayoutType;
  innerFactory?: () => GridLayoutStrategy<T>;
  onGroupLayout?: (groupKey: string, nodes: LayoutNode<T>[]) => void;
  isHeroMode?: boolean; // Whether we're in hero mode (for 'auto' scale config)
}

/**
 * Group header position info
 */
export type GroupHeaderInfo = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export class PivotLayouter<T> {
  // Store group header positions for rendering and hit-testing
  private groupHeaders: GroupHeaderInfo[] = [];

  constructor(private config: PivotConfig<T>) {}

  // Helper getters for individual padding values (use fallback if not set)
  private get paddingTop(): number {
    return this.config.framePaddingTop ?? this.config.framePadding;
  }

  private get paddingRight(): number {
    return this.config.framePaddingRight ?? this.config.framePadding;
  }

  private get paddingBottom(): number {
    return this.config.framePaddingBottom ?? this.config.framePadding;
  }

  private get paddingLeft(): number {
    return this.config.framePaddingLeft ?? this.config.framePadding;
  }

  /**
   * Get group header positions (for rendering)
   */
  getGroupHeaders(): GroupHeaderInfo[] {
    return this.groupHeaders;
  }

  compute(nodes: LayoutNode<T>[], view: { width: number; height: number }) {
    if (nodes.length === 0) {
      this.groupHeaders = [];
      return;
    }
    
    // Reset group headers
    this.groupHeaders = [];
    
    // Group products by category
    const groups = new Map<string, LayoutNode<T>[]>();
    for (const n of nodes) {
      const key = this.config.groupKey(n.data);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    const keys = Array.from(groups.keys());
    if (this.config.groupSort) keys.sort(this.config.groupSort);

    // Calculate weight context for scaling
    const weights: number[] = [];
    nodes.forEach(n => {
      const w = this.config.access.weight(n.data);
      if (typeof w === 'number') weights.push(w);
    });

    // Resolve 'auto' mode based on isHeroMode
    const isHeroMode = this.config.isHeroMode ?? false;
    const masterEnabled = resolveScaleEnabled(SCALE_CONFIG.enabled, isHeroMode);
    const weightEnabled = resolveScaleEnabled(SCALE_CONFIG.weight?.enabled ?? true, isHeroMode);
    const scaleEnabled = masterEnabled && weightEnabled;

    const ctx: ScaleContext = {
      weightMin: scaleEnabled && weights.length ? Math.min(...weights) : undefined,
      weightMax: scaleEnabled && weights.length ? Math.max(...weights) : undefined,
      clampMin: SCALE_CONFIG.weight?.clampMin ?? 0.8,
      clampMax: SCALE_CONFIG.weight?.clampMax ?? 1.4,
    };

    const baseH = this.config.rowBaseHeight || 120;
    const deriveScale = (n: LayoutNode<T>) => this.config.scale.computeScale(n.data as any, ctx);

    // Use shelf layout (Microsoft Pivot style)
    const innerLayoutType = this.config.innerLayoutType || 'shelf';
    
    if (innerLayoutType === 'shelf') {
      const orientation = this.config.orientation ?? 'columns';
      // === INTELLIGENT CELL MATRIX PIVOT LAYOUT ===
      // Global optimization: Find cell size that fits the LARGEST group, use for all groups
      
      const isMobile = view.width < 768;
      const headerHeight = isMobile ? Math.round(BUCKET_BUTTON_CONFIG.height * 0.3) : BUCKET_BUTTON_CONFIG.height;
      const numGroups = keys.length;

      if (orientation === 'rows') {
        // === ROWS LAYOUT (mobile/portrait) ===
        // Same algorithm as columns, just rotated:
        // screenHeight / numBuckets = frameHeight
        // Binary search cell size within screenWidth x (frameHeight - headerHeight)
        // Products fill top-to-bottom first, then add columns to the right (column-major)
        // Height bounded by frameHeight, width unbounded
        const rowsForSizing = numGroups;
        const totalGaps = this.config.frameGap * Math.max(0, rowsForSizing - 1);
        const totalVertPadding = this.paddingTop + this.paddingBottom;
        const availableHeight = view.height - totalGaps - totalVertPadding;
        const frameHeight = availableHeight / Math.max(1, rowsForSizing);

        const spacing = this.config.itemGap;
        const matrixHeight = Math.max(1, frameHeight - headerHeight);
        const matrixWidth = Math.max(1, view.width - this.paddingLeft - this.paddingRight);

        // Find the group with the MOST products
        let maxProductsInAnyGroup = 0;
        for (const k of keys) {
          maxProductsInAnyGroup = Math.max(maxProductsInAnyGroup, groups.get(k)!.length);
        }

        // For rows mode: width is unbounded (products scroll right).
        // Cell size is determined only by how many rows fit in the frameHeight.
        // No binary search needed — just divide frameHeight by desired row count.
        const fitsInHeight = (cellSize: number): boolean => {
          if (cellSize <= 0) return false;
          return Math.floor((matrixHeight + spacing) / (cellSize + spacing)) >= 1;
        };

        const preferredMin = this.config.minCellSize ?? 5;
        const preferredMax = this.config.maxCellSize ?? Math.min(matrixWidth, matrixHeight);
        const absoluteMin = 5;
        const searchMin = absoluteMin;
        const searchMax = Math.max(searchMin, Math.min(preferredMax, Math.min(matrixWidth, matrixHeight)));

        // Binary search: find largest cell size where the largest group
        // fits within the frameHeight. Width is unbounded (scrolls right).
        // We want multiple rows to fill the height — more rows = smaller cells = more visible.
        let globalCellSize = searchMin;

        if (this.config.cellSizeOverride && this.config.cellSizeOverride > 0) {
          globalCellSize = this.config.cellSizeOverride;
        } else if (fitsInHeight(searchMin)) {
          // Target: enough rows so that cols needed stays reasonable
          // rows = matrixHeight / cellSize, cols = maxProducts / rows
          // We want cols to be roughly screenWidth / cellSize (fill the screen)
          const targetCols = Math.max(1, Math.floor((matrixWidth + spacing) / (searchMin + spacing)));
          const targetRows = Math.max(1, Math.ceil(maxProductsInAnyGroup / targetCols));
          // Cell size from target rows
          const fromTargetRows = Math.max(searchMin, (matrixHeight + spacing) / targetRows - spacing);
          globalCellSize = Math.max(searchMin, Math.min(searchMax, fromTargetRows));
        }

        let globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));

        // Enforce hard minimum
        if (this.config.minCellSize && globalCellSize < this.config.minCellSize) {
          globalCellSize = this.config.minCellSize;
          globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
        }

        // Layout each group using same cell size
        let offsetY = this.paddingTop;
        for (const k of keys) {
          const list = groups.get(k)!;
          if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
          this.config.onGroupLayout?.(k, list);

          const productsInThisGroup = list.length;
          const rowsInFrame = Math.max(1, Math.min(globalRows, productsInThisGroup));
          const colsInFrame = Math.max(1, Math.ceil(productsInThisGroup / rowsInFrame));

          // Header at left edge
          this.groupHeaders.push({
            key: k,
            label: k,
            x: this.paddingLeft,
            y: offsetY,
            width: view.width - this.paddingLeft - this.paddingRight,
            height: headerHeight
          });

          const baseY = offsetY + headerHeight;

          // Column-major fill: top-to-bottom first, then right
          for (let col = 0; col < colsInFrame; col++) {
            for (let row = 0; row < rowsInFrame; row++) {
              const productIndex = col * rowsInFrame + row;
              if (productIndex >= list.length) break;
              const node = list[productIndex];
              const scale = deriveScale(node);
              const finalSize = globalCellSize * scale;
              const x = this.paddingLeft + col * (globalCellSize + spacing);
              const y = baseY + row * (globalCellSize + spacing);
              node.posX.targetValue = x;
              node.posY.targetValue = y;
              node.width.targetValue = finalSize;
              node.height.targetValue = finalSize;
              node.scale.targetValue = 1;
              node.opacity.targetValue = 1;
            }
          }

          offsetY += frameHeight + this.config.frameGap;
        }

        return;
      }

      // Calculate frame width: divide viewport among ALL groups
      const columnsForSizing = numGroups;
      const totalGaps = this.config.frameGap * Math.max(0, columnsForSizing - 1);
      const totalPadding = this.paddingLeft + this.paddingRight;
      const availableWidth = view.width - totalGaps - totalPadding;
      const frameWidth = availableWidth / Math.max(1, columnsForSizing);

      // Calculate available height for products (minus header and padding)
      const availableHeight = view.height - this.paddingBottom - this.paddingTop - headerHeight;

      // STEP 1: Find the group with the MOST products
      let maxProductsInAnyGroup = 0;
      for (const k of keys) {
        const list = groups.get(k)!;
        maxProductsInAnyGroup = Math.max(maxProductsInAnyGroup, list.length);
      }

      // STEP 2: Calculate optimal cell size for the LARGEST group
      const spacing = this.config.itemGap;
      const matrixWidth = Math.max(1, frameWidth);
      const matrixHeight = Math.max(1, availableHeight);
      
      const fitsAllProducts = (cellSize: number): boolean => {
        if (cellSize <= 0) return false;
        const cols = Math.max(1, Math.floor((matrixWidth + spacing) / (cellSize + spacing)));
        const rows = Math.max(1, Math.floor((matrixHeight + spacing) / (cellSize + spacing)));
        return cols * rows >= maxProductsInAnyGroup;
      };
      
      const preferredMin = this.config.minCellSize ?? 5;
      const preferredMax = this.config.maxCellSize ?? Math.min(matrixWidth, matrixHeight);
      
      const absoluteMin = 5;
      const searchMin = absoluteMin;
      const searchMax = Math.max(
        searchMin,
        Math.min(preferredMax, Math.min(matrixWidth, matrixHeight))
      );
      
      let globalCellSize = searchMin;
      let globalCols = 1;
      let globalRows = maxProductsInAnyGroup;

      if (this.config.cellSizeOverride && this.config.cellSizeOverride > 0) {
        globalCellSize = this.config.cellSizeOverride;
      } else if (fitsAllProducts(searchMin)) {
        let low = searchMin;
        let high = searchMax;
        
        // Expand upper bound if even the max cell size fits (rare but possible for small groups)
        while (fitsAllProducts(high) && high < searchMax * 4) {
          high *= 1.5;
        }
        
        for (let i = 0; i < 30; i++) {
          const mid = (low + high) / 2;
          if (fitsAllProducts(mid)) {
            low = mid; // Mid fits, try bigger cells
          } else {
            high = mid;
          }
        }
        
        globalCellSize = Math.max(searchMin, Math.min(searchMax, low));
        
        if (globalCellSize < preferredMin && fitsAllProducts(preferredMin)) {
          globalCellSize = Math.min(searchMax, preferredMin);
        }
      } else {
        console.warn(`PivotLayouter: Even the minimum cell size ${searchMin}px cannot fit ${maxProductsInAnyGroup} products within the available matrix ${matrixWidth}x${matrixHeight}.`);
        globalCellSize = searchMin;
      }
      
      // Derive resulting column/row capacity for the chosen cell size
      globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
      globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
      
      // Final safety check – if rounding dropped capacity, reduce size slightly
      // Skip if cell size is overridden — user wants that size even if it overflows
      if (!this.config.cellSizeOverride) {
        while (globalCols * globalRows < maxProductsInAnyGroup && globalCellSize > searchMin) {
          globalCellSize = Math.max(searchMin, globalCellSize - 0.5);
          globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
          globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
        }
      }
      
      // Enforce hard minimum cell size (content may overflow)
      if (this.config.minCellSize && globalCellSize < this.config.minCellSize) {
        globalCellSize = this.config.minCellSize;
        globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
        globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
      }

      // STEP 3: Layout ALL groups using the SAME cell size
      let offsetX = this.paddingLeft;
      for (const k of keys) {
        const list = groups.get(k)!;
        if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
        this.config.onGroupLayout?.(k, list);

        const productsInThisGroup = list.length;
        const cellSize = globalCellSize;
        
        const maxColsForFrame = Math.max(
          1,
          Math.floor((matrixWidth + this.config.itemGap) / (cellSize + this.config.itemGap))
        );
        const colsInFrame = Math.max(
          1,
          Math.min(globalCols, maxColsForFrame, productsInThisGroup)
        );
        const rowsInFrame = Math.max(1, Math.ceil(productsInThisGroup / colsInFrame));

        const headerY = view.height - headerHeight - this.paddingBottom;

        // Store group header position at bottom of column (classic Pivot style)
        this.groupHeaders.push({
          key: k,
          label: k,
          x: offsetX,
          y: headerY,
          width: frameWidth,
          height: headerHeight
        });

        const baseY = headerY - cellSize;

        // Layout products in a grid within this column (BOTTOM TO TOP, LEFT TO RIGHT)
        for (let row = 0; row < rowsInFrame; row++) {
          for (let col = 0; col < colsInFrame; col++) {
            const productIndex = row * colsInFrame + col;
            if (productIndex >= list.length) break;

            const node = list[productIndex];
            const scale = deriveScale(node);
            const finalSize = cellSize * scale;

            const x = offsetX + col * (cellSize + spacing);
            const y = baseY - row * (cellSize + spacing);
             
            node.posX.targetValue = x;
            node.posY.targetValue = y;
            node.width.targetValue = finalSize;
            node.height.targetValue = finalSize;
            node.scale.targetValue = 1;
            node.opacity.targetValue = 1;
          }
        }
        
        offsetX += frameWidth + this.config.frameGap;
      }
    } else {
      // GRID LAYOUT: Original grid-based layout
      const inner = this.config.innerFactory!();
      inner.spacingX = this.config.itemGap; 
      inner.spacingY = this.config.itemGap;

      const totalGap = this.config.frameGap * Math.max(0, keys.length - 1);
      const frameWidth = Math.max(0, (view.width - totalGap - this.paddingLeft - this.paddingRight) / Math.max(1, keys.length));

      let offsetX = this.paddingLeft;
      for (const k of keys) {
          const list = groups.get(k)!;
          if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
          this.config.onGroupLayout?.(k, list);
        const cols = inner.deriveCols(frameWidth, baseH);
        inner.layout(offsetX, view.height - this.paddingBottom, frameWidth, list, baseH, cols, deriveScale);
        offsetX += frameWidth + this.config.frameGap;
      }
    }
  }
}
