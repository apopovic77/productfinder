import { LayoutNode } from './LayoutNode';
import { GridLayoutStrategy } from './GridLayoutStrategy';
import { ShelfLayoutStrategy } from './ShelfLayoutStrategy';
import { WeightScalePolicy, type ScaleContext } from './ScalePolicy';
import { PivotGroup } from './PivotGroup';
import { Vector2 } from 'arkturian-typescript-utils';

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
  framePadding: number;
  itemGap: number;
  rowBaseHeight?: number;
  colBaseWidth?: number;
  minCellSize?: number;
  maxCellSize?: number;
  smallGroupThreshold?: number;
  access: { weight(item: T): number | undefined };
  scale: WeightScalePolicy;
  innerLayoutType?: InnerLayoutType;
  innerFactory?: () => GridLayoutStrategy<T>;
  onGroupLayout?: (groupKey: string, nodes: LayoutNode<T>[]) => void;
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
    const ctx: ScaleContext = { 
      weightMin: weights.length ? Math.min(...weights) : undefined, 
      weightMax: weights.length ? Math.max(...weights) : undefined, 
      clampMin: 0.8, 
      clampMax: 1.4 
    };

    const baseH = this.config.rowBaseHeight || 120;
    const deriveScale = (n: LayoutNode<T>) => this.config.scale.computeScale(n.data as any, ctx);

    // Use shelf layout (Microsoft Pivot style)
    const innerLayoutType = this.config.innerLayoutType || 'shelf';
    
    if (innerLayoutType === 'shelf') {
      const orientation = this.config.orientation ?? 'columns';
      // === INTELLIGENT CELL MATRIX PIVOT LAYOUT ===
      // Global optimization: Find cell size that fits the LARGEST group, use for all groups
      
      const headerHeight = 40;
      const numGroups = keys.length;

      if (orientation === 'rows') {
        const totalGaps = this.config.frameGap * Math.max(0, numGroups - 1);
        const availableHeight = view.height - totalGaps - this.config.framePadding * 2;
        const frameHeight = availableHeight / Math.max(1, numGroups);
        const matrixWidth = Math.max(1, view.width - this.config.framePadding * 2 - this.config.itemGap * 2);
        const matrixHeight = Math.max(1, frameHeight - headerHeight - this.config.itemGap * 2);
        const spacing = this.config.itemGap;

        let maxProductsInAnyGroup = 0;
        for (const k of keys) {
          const list = groups.get(k)!;
          maxProductsInAnyGroup = Math.max(maxProductsInAnyGroup, list.length);
        }

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
        const searchMax = Math.max(searchMin, Math.min(preferredMax, Math.min(matrixWidth, matrixHeight)));

        let globalCellSize = searchMin;
        let globalCols = 1;
        let globalRows = maxProductsInAnyGroup;

        if (fitsAllProducts(searchMin)) {
          let low = searchMin;
          let high = searchMax;
          while (fitsAllProducts(high) && high < searchMax * 4) {
            high *= 1.5;
          }
          for (let i = 0; i < 30; i++) {
            const mid = (low + high) / 2;
            if (fitsAllProducts(mid)) {
              low = mid;
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

        globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
        globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));

        while (globalCols * globalRows < maxProductsInAnyGroup && globalCellSize > searchMin) {
          globalCellSize = Math.max(searchMin, globalCellSize - 0.5);
          globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
          globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
        }

        let offsetY = this.config.framePadding;
        for (const k of keys) {
          const list = groups.get(k)!;
          if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));

          const productsInThisGroup = list.length;
          const smallGroupThreshold = this.config.smallGroupThreshold ?? 8;
          const cellSize = globalCellSize;

          const maxRows = Math.max(1, Math.floor((matrixHeight + spacing) / (cellSize + spacing)));
          const maxPossibleCols = Math.max(1, Math.floor((matrixWidth + spacing) / (cellSize + spacing)));

          const minNeededCols = Math.ceil(productsInThisGroup / Math.max(1, maxRows));
          const maxUsableCols = Math.max(1, maxPossibleCols);
          let colsInFrame = Math.min(maxUsableCols, Math.max(1, productsInThisGroup));

          if (maxRows > 0) {
            const minColsForHeight = Math.min(maxUsableCols, minNeededCols);
            colsInFrame = Math.max(colsInFrame, minColsForHeight);
          }

          const rowsInFrame = Math.ceil(productsInThisGroup / colsInFrame);
          const renderAsRow = productsInThisGroup > 0 && productsInThisGroup <= smallGroupThreshold;

          this.groupHeaders.push({
            key: k,
            label: k,
            x: this.config.framePadding,
            y: offsetY,
            width: view.width - this.config.framePadding * 2,
            height: headerHeight
          });

          const baseY = offsetY + headerHeight + spacing;

          if (renderAsRow) {
            const totalWidth = productsInThisGroup * (cellSize + spacing) - spacing;
            const startX = this.config.framePadding + Math.max(0, (matrixWidth - totalWidth) / 2);
            for (let index = 0; index < list.length; index++) {
              const node = list[index];
              const scale = deriveScale(node);
              const finalSize = cellSize * scale;
              const x = startX + index * (cellSize + spacing);
              const y = baseY;
              node.posX.value = x;
              node.posY.value = y;
              node.width.value = finalSize;
              node.height.value = finalSize;
              node.scale.value = 1;
              node.opacity.value = 1;
            }
          } else {
            for (let row = 0; row < rowsInFrame; row++) {
              for (let col = 0; col < colsInFrame; col++) {
                const productIndex = row * colsInFrame + col;
                if (productIndex >= list.length) break;
                const node = list[productIndex];
                const scale = deriveScale(node);
                const finalSize = cellSize * scale;
                const x = this.config.framePadding + spacing + col * (cellSize + spacing);
                const y = baseY + row * (cellSize + spacing);
                node.posX.value = x;
                node.posY.value = y;
                node.width.value = finalSize;
                node.height.value = finalSize;
                node.scale.value = 1;
                node.opacity.value = 1;
              }
            }
          }

          offsetY += frameHeight + this.config.frameGap;
        }

        return;
      }

      // Calculate frame width: ALL groups must fit on screen initially
      const totalGaps = this.config.frameGap * Math.max(0, numGroups - 1);
      const totalPadding = this.config.framePadding * 2;
      const availableWidth = view.width - totalGaps - totalPadding;
      const frameWidth = availableWidth / Math.max(1, numGroups);
      
      // Calculate available height for products (minus header and padding)
      const availableHeight = view.height - this.config.framePadding - headerHeight - 20;
      
      // STEP 1: Find the group with the MOST products
      let maxProductsInAnyGroup = 0;
      for (const k of keys) {
        const list = groups.get(k)!;
        maxProductsInAnyGroup = Math.max(maxProductsInAnyGroup, list.length);
      }
      
      // STEP 2: Calculate optimal cell size for the LARGEST group
      const spacing = this.config.itemGap;
      const matrixWidth = Math.max(1, frameWidth - spacing * 2);
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
      
      if (fitsAllProducts(searchMin)) {
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
      while (globalCols * globalRows < maxProductsInAnyGroup && globalCellSize > searchMin) {
        globalCellSize = Math.max(searchMin, globalCellSize - 0.5);
        globalCols = Math.max(1, Math.floor((matrixWidth + spacing) / (globalCellSize + spacing)));
        globalRows = Math.max(1, Math.floor((matrixHeight + spacing) / (globalCellSize + spacing)));
      }
      
      // STEP 3: Layout all groups using the SAME cell size
      let offsetX = this.config.framePadding;
      for (const k of keys) {
        const list = groups.get(k)!;
        if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
        this.config.onGroupLayout?.(k, list);
        
        const productsInThisGroup = list.length;
        const smallGroupThreshold = this.config.smallGroupThreshold ?? 8;
        
        // Use global cell size, but calculate cols/rows for THIS group's product count
        const cellSize = globalCellSize;
        
        // Calculate how many rows fit in the available height with this cell size
        const maxRows = Math.floor((matrixHeight + this.config.itemGap) / (cellSize + this.config.itemGap));
        
        // Calculate maximum possible columns that fit in the frame width
        const maxPossibleCols = Math.floor((matrixWidth + this.config.itemGap) / (cellSize + this.config.itemGap));
        
        // Calculate minimum columns needed for THIS group
        const minNeededCols = Math.ceil(productsInThisGroup / Math.max(1, maxRows));
        
        const maxUsableCols = Math.max(1, maxPossibleCols);
        let colsInFrame = Math.min(maxUsableCols, Math.max(1, productsInThisGroup));
        
        if (maxRows > 0) {
          const minColsForHeight = Math.min(maxUsableCols, minNeededCols);
          colsInFrame = Math.max(colsInFrame, minColsForHeight);
        }
        
        const rowsInFrame = Math.ceil(productsInThisGroup / colsInFrame);
        const renderAsRow = productsInThisGroup > 0 && productsInThisGroup <= smallGroupThreshold;
        
        // Debug output
        console.log(`Group ${k}: products=${productsInThisGroup}, cellSize=${cellSize}, maxRows=${maxRows}, minNeeded=${minNeededCols}, maxPossible=${maxPossibleCols}, cols=${colsInFrame}, rows=${rowsInFrame}`);
        
        // Store group header position (at bottom of screen)
        this.groupHeaders.push({
          key: k,
          label: k,
          x: offsetX,
          y: view.height - headerHeight,
          width: frameWidth,
          height: headerHeight
        });
        
        // Layout products in a grid within this column (BOTTOM TO TOP, LEFT TO RIGHT)
        // Use C# CellMatrixLayouter logic: rows first (y), then columns (x)
        // This fills HORIZONTALLY first (left-to-right), then moves up
        if (renderAsRow) {
          const totalWidth = productsInThisGroup * (cellSize + spacing) - spacing;
          const startX = offsetX + Math.max(spacing, (frameWidth - totalWidth) / 2);
          for (let index = 0; index < list.length; index++) {
            const node = list[index];
            const scale = deriveScale(node);
            const finalSize = cellSize * scale;
            const x = startX + index * (cellSize + spacing);
            const y = view.height - headerHeight - this.config.itemGap - cellSize;
            node.posX.value = x;
            node.posY.value = y;
            node.width.value = finalSize;
            node.height.value = finalSize;
            node.scale.value = 1;
            node.opacity.value = 1;
          }
        } else {
          for (let row = 0; row < rowsInFrame; row++) {
            for (let col = 0; col < colsInFrame; col++) {
              const productIndex = row * colsInFrame + col;
              if (productIndex >= list.length) break;
              
              const node = list[productIndex];
              const scale = deriveScale(node);
              const finalSize = cellSize * scale;
              
              const x = offsetX + this.config.itemGap + col * (cellSize + this.config.itemGap);
              const y = view.height - headerHeight - this.config.itemGap - (row + 1) * (cellSize + this.config.itemGap);
              
              node.posX.value = x;
              node.posY.value = y;
              node.width.value = finalSize;
              node.height.value = finalSize;
              node.scale.value = 1;
              node.opacity.value = 1;
            }
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
      const frameWidth = Math.max(0, (view.width - totalGap - 2 * this.config.framePadding) / Math.max(1, keys.length));

      let offsetX = this.config.framePadding;
      for (const k of keys) {
          const list = groups.get(k)!;
          if (this.config.itemSort) list.sort((a, b) => this.config.itemSort!(a.data, b.data));
          this.config.onGroupLayout?.(k, list);
        const cols = inner.deriveCols(frameWidth, baseH);
        inner.layout(offsetX, view.height - this.config.framePadding, frameWidth, list, baseH, cols, deriveScale);
        offsetX += frameWidth + this.config.frameGap;
      }
    }
  }
}
