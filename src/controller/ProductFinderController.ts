import type { Product } from '../types/Product';
import { FilterService, type FilterCriteria, type SortMode } from '../services/FilterService';
import { LayoutService, type LayoutMode } from '../services/LayoutService';
import { FavoritesService } from '../services/FavoritesService';
import { ViewportService } from '../services/ViewportService';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { SkeletonRenderer } from '../render/SkeletonRenderer';
import { ProductRenderAccessors } from '../layout/Accessors';
import { fetchProducts } from '../data/ProductRepository';
import type { GroupDimension, PriceBucketMode } from '../services/PivotDrillDownService';
import { PivotDimensionAnalyzer, type PivotAnalysisResult, type PivotDimensionDefinition } from '../services/PivotDimensionAnalyzer';
import type { Orientation } from '../layout/PivotLayouter';
import type { PivotGroup } from '../layout/PivotGroup';

export type ControllerState = {
  loading: boolean;
  error: string | null;
  products: Product[];
  filteredProducts: Product[];
  pivotGroups: PivotGroup[];
  familyGrouped: boolean;
};

export type StateChangeListener = (state: ControllerState) => void;

export class ProductFinderController {
  // Services
  private filterService = new FilterService();
  private layoutService = new LayoutService();
  private favoritesService = new FavoritesService();
  private viewportService = new ViewportService();

  // Renderers
  private renderer: CanvasRenderer<Product> | null = null;
  private _productLimit = 5000;
  private skeletonRenderer: SkeletonRenderer | null = null;
  private skeletonRafId: number | null = null;
  private renderAccess = new ProductRenderAccessors();
  private pivotAnalyzer = new PivotDimensionAnalyzer();
  private pivotModel: PivotAnalysisResult | null = null;

  // State
  private products: Product[] = [];
  private loading = true;
  private error: string | null = null;
  private listeners: StateChangeListener[] = [];

  // Family grouping
  private _familyGrouped = false;
  private _familyMap: Map<string, Product[]> = new Map();

  // Canvas
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // History integration
  private historyPopStateHandler: ((e: PopStateEvent) => void) | null = null;
  private ignoreNextHistoryPush = false;

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    if (!this.ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Initialize viewport
    this.viewportService.initialize(canvas);

    // Setup browser history integration for pivot drill-down
    this.setupHistoryIntegration();

    // Initialize skeleton renderer
    this.skeletonRenderer = new SkeletonRenderer(this.ctx);
    this.startSkeletonAnimation();

    // Initialize main renderer
    this.renderer = new CanvasRenderer<Product>(
      this.ctx,
      () => this.layoutService.getEngine().all(),
      this.renderAccess,
      this.viewportService.getTransform(),
      () => this.layoutService.getGroupHeaders(),
      () => this.layoutService.getPivotDimension()
    );

    // Setup favorites listener
    this.favoritesService.addListener(() => this.onDataChanged());

    // Initial resize to ensure canvas has correct size
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(() => this.handleResize(), 0);

    // Load products
    try {
      const results = await fetchProducts({ limit: 5000 });
      this.products = results || [];
      this.pivotModel = this.pivotAnalyzer.analyze(this.products);
      this.layoutService.setPivotModel(this.pivotModel);
      this.loading = false;
      this.stopSkeletonAnimation();
      if (this.renderer) this.renderer.start();
      this.onDataChanged();
      
      // Resize again after data is loaded to ensure correct layout
      setTimeout(() => this.handleResize(), 100);
    } catch (e: any) {
      this.error = e.message || 'Load error';
      this.loading = false;
      this.stopSkeletonAnimation();
      this.notifyListeners();
    }
  }

  destroy(): void {
    if (this.renderer) this.renderer.stop();
    this.stopSkeletonAnimation();
    this.viewportService.destroy();

    // Remove history listener
    if (this.historyPopStateHandler) {
      window.removeEventListener('popstate', this.historyPopStateHandler);
      this.historyPopStateHandler = null;
    }
  }

  /**
   * Called after pivot drill/up/reset.
   * The LayoutService already synced with correct filtered products.
   * We only need to re-layout and notify listeners — NO re-sync.
   */
  private onPivotChanged(): void {
    if (this.canvas) {
      this.handleResize();
      if (this.renderer) {
        const isHero = this.layoutService.isPivotHeroMode();
        this.renderer.isHeroMode = isHero;
      }
    }
    this.notifyListeners();
  }

  // Data Management
  private onDataChanged(): void {
    let filtered = this.filterService.filterAndSort(this.products);
    filtered = this.favoritesService.filter(filtered);

    // Apply family grouping: collapse products with same product_code into one representative
    if (this._familyGrouped) {
      filtered = this.collapseByFamily(filtered);
    }

    // Apply dev product limit
    if (filtered.length > this._productLimit) {
      filtered = filtered.slice(0, this._productLimit);
    }
    const analyzerSource = filtered.length > 0 ? filtered : this.products;
    this.pivotModel = this.pivotAnalyzer.analyze(analyzerSource);
    this.layoutService.setPivotModel(this.pivotModel);

    this.layoutService.sync(filtered, analyzerSource);

    // Re-layout: recalculate canvas dimensions (respects insets from settings panel)
    if (this.canvas) {
      this.handleResize();

      // Update renderer hero mode state
      if (this.renderer) {
        const isHero = this.layoutService.isPivotHeroMode();
        this.renderer.isHeroMode = isHero;
        // Enable labels in hero mode (name + color)
        if (isHero && this.layoutService.getMode() !== 'lanes') {
          this.renderer.productLabels.update({
            enabled: true,
            fields: ['name', 'color'],
            position: 'below',
            nameColor: 'rgba(0, 0, 0, 0.85)',
            detailColor: 'rgba(0, 0, 0, 0.5)',
          });
        } else if (this.layoutService.getMode() !== 'lanes') {
          this.renderer.productLabels.enabled = false;
        }
      }

      // Calculate and set content bounds after layout
      this.updateContentBounds();
    }

    this.notifyListeners();
  }

  /**
   * Calculate content bounds from all visible nodes and update viewport.
   * Should be called after layout changes.
   */
  private updateContentBounds(): void {
    if (!this.canvas) {
      console.warn('[ProductFinderController] No canvas available for updateContentBounds');
      return;
    }

    // Pass viewport size to LayoutService for fixed bounds calculation in Pivot Mode
    const bounds = this.layoutService.getContentBounds(this.canvas.width, this.canvas.height);

    if (!bounds) {
      // No bounds available yet (e.g., during initial load) - this is normal
      return;
    }

    // Set content bounds on viewport
    this.viewportService.setContentBounds(bounds);

    // Debug: pass bounds to renderer for visualization
    if (this.renderer) {
      this.renderer.debugBoundsContent = {
        x: bounds.minX, y: bounds.minY,
        w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY,
      };
      // Auto bounds = viewport size (what auto cell size would produce)
      if (this.canvas) {
        this.renderer.debugBoundsAuto = {
          x: 0, y: 0,
          w: this.canvas.width, h: this.canvas.height,
        };
      }
      // Pass bucket bounds from group headers
      const headers = this.layoutService.getGroupHeaders();
      this.renderer.debugBucketBounds = headers.map(h => ({
        key: h.key,
        x: h.x,
        y: h.y,
        w: h.width,
        h: h.height,
        productCount: 0,
        cellSize: 0,
      }));
    }

    // Different viewport behavior for hero mode (product presentation)
    const isHeroMode = this.layoutService.isPivotHeroMode();

    const isLanesMode = this.layoutService.getMode() === 'lanes';

    if (isHeroMode) {
      // Hero mode: Horizontal-only scrolling, scale 1.0 (no zoom)
      this.viewportService.setLockVerticalPan(true);
      const centerX = bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      this.viewportService.centerOn(centerX, centerY, 1);
    } else if (isLanesMode) {
      // Lanes mode: Fixed scale 1.0, free vertical scrolling, start at top, no zoom-out
      this.viewportService.setLockVerticalPan(false);
      const vt = this.viewportService.getTransform();
      if (vt) {
        vt.minScaleOverride = 0.8;
        vt.panWithLeftButton = true;
      }
      this.viewportService.centerOn(bounds.minX + (this.canvas?.width ?? 0) / 2, bounds.minY + (this.canvas?.height ?? 0) / 2, 1);
    } else {
      // Pivot mode: free panning
      this.viewportService.setLockVerticalPan(false);
      const vt = this.viewportService.getTransform();
      const vw = this.canvas?.width ?? 800;
      const vh = this.canvas?.height ?? 600;

      if (vt) {
        vt.panWithLeftButton = true;
        // If content overflows viewport (from cellSizeOverride OR minCellSize),
        // zoom-out limit = fit viewport (blue bounds), not content (red bounds)
        const contentOverflows = bounds.maxX > vw || bounds.maxY > vh || bounds.minY < 0 || bounds.minX < 0;
        if (contentOverflows) {
          vt.minScaleOverride = 1;
        } else {
          vt.minScaleOverride = null;
        }
      }

      // Position camera based on orientation:
      // columns (desktop): bottom-aligned (buckets at bottom, content grows up)
      // rows (mobile): left/top-aligned (buckets at left, content grows right)
      const scale = vt?.minScaleOverride ?? 1;
      const isRows = this.layoutService.getPivotOrientation() === 'rows';

      let offsetX: number;
      let offsetY: number;

      if (isRows) {
        offsetX = -bounds.minX * scale;
        offsetY = -bounds.minY * scale;
      } else {
        offsetX = -bounds.minX * scale;
        offsetY = vh - bounds.maxY * scale;
      }

      this.viewportService.getTransform()?.setPosition(offsetX, offsetY, scale);
    }
  }

  getFilteredProducts(): Product[] {
    let filtered = this.filterService.filterAndSort(this.products);
    return this.favoritesService.filter(filtered);
  }

  // Filter API
  setFilterCriteria(criteria: Partial<FilterCriteria>): void {
    this.filterService.setCriteria(criteria);
    this.onDataChanged();
  }

  getFilterCriteria(): FilterCriteria {
    return this.filterService.getCriteria();
  }

  setAiFilterProductIds(ids: string[]): void {
    this.filterService.setIncludeIds(ids);
    this.onDataChanged();
  }

  clearAiFilterProductIds(): void {
    this.filterService.clearIncludeIds();
    this.onDataChanged();
  }

  getAiFilterProductIds(): string[] {
    return this.filterService.getIncludeIds();
  }

  isAiFilterActive(): boolean {
    return this.filterService.hasIncludeIds();
  }

  resetFilters(): void {
    this.filterService.resetCriteria();
    this.onDataChanged();
  }

  setSortMode(mode: SortMode): void {
    this.filterService.setSortMode(mode);
    this.onDataChanged();
  }

  getSortMode(): SortMode {
    return this.filterService.getSortMode();
  }

  // Layout API
  setLayoutMode(mode: LayoutMode): void {
    this.layoutService.setMode(mode);
    if (this.renderer) {
      this.renderer.backgroundColor = mode === 'lanes' ? '#ffffff' : null;
      if (mode === 'lanes') {
        this.renderer.productLabels.update({
          enabled: true,
          fields: ['category', 'name', 'price'],
          position: 'below',
          nameColor: 'rgba(0, 0, 0, 0.85)',
          detailColor: 'rgba(0, 0, 0, 0.45)',
          priceColor: '#ff6b00',
        });
      } else {
        this.renderer.productLabels.enabled = false;
      }
    }
    this.onDataChanged();
  }

  getLayoutMode(): LayoutMode {
    return this.layoutService.getMode();
  }

  // Favorites API
  toggleFavorite(productId: string): boolean {
    return this.favoritesService.toggle(productId);
  }

  isFavorite(productId: string): boolean {
    return this.favoritesService.isFavorite(productId);
  }

  setShowOnlyFavorites(show: boolean): void {
    this.favoritesService.setShowOnlyFavorites(show);
    this.onDataChanged();
  }

  getShowOnlyFavorites(): boolean {
    return this.favoritesService.getShowOnlyFavorites();
  }

  // Viewport API
  resetViewport(): void {
    this.viewportService.reset();
  }

  /**
   * Center viewport on a product (smooth animation) with hero zoom
   * Zooms in so product takes 80% of screen height
   * Rubberband system automatically prevents bounds violations
   */
  centerOnProduct(product: Product): void {
    const viewport = this.viewportService.getTransform();
    if (!viewport) return;

    // Find the node for this product
    const nodes = this.layoutService.getEngine().all();
    const node = nodes.find(n => n.data.id === product.id);

    if (!node) {
      console.warn('[ProductFinderController] Product node not found for centering');
      return;
    }

    // Get product center and dimensions in world coordinates
    const x = node.posX.value ?? 0;
    const y = node.posY.value ?? 0;
    const w = node.width.value ?? 0;
    const h = node.height.value ?? 0;

    const centerX = x + w / 2;
    const centerY = y + h / 2;

    // Calculate hero zoom: product should take a portion of screen height
    const screenHeight = viewport.viewportHeight;
    const screenWidth = viewport.viewportWidth;
    const isMobile = screenWidth < 768;
    const fillRatio = isMobile ? 0.6 : 0.9;
    const targetScale = (screenHeight * fillRatio) / h;

    const clampedScale = Math.min(targetScale, viewport.maxScale);

    // On mobile: position product in upper third (leave space for V2 dialog below)
    const focusY = isMobile ? centerY + h * 0.4 : centerY;
    this.viewportService.centerOn(centerX, focusY, clampedScale);
    // Hero zoom applied
  }

  // Hit Testing
  hitTest(screenX: number, screenY: number): Product | null {
    const worldPos = this.viewportService.screenToWorld(screenX, screenY);
    const nodes = this.layoutService.getEngine().all();

    // REVERSE iteration: last rendered = on top = should be found first
    // This ensures we hit the visually topmost product
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const nx = node.posX.targetValue ?? node.posX.value ?? 0;
      const ny = node.posY.targetValue ?? node.posY.value ?? 0;
      const nw = node.width.targetValue ?? node.width.value ?? 0;
      const nh = node.height.targetValue ?? node.height.value ?? 0;

      if (worldPos.x >= nx && worldPos.x <= nx + nw && worldPos.y >= ny && worldPos.y <= ny + nh) {
        return node.data;
      }
    }

    return null;
  }

  // Renderer Access
  setHoveredProduct(product: Product | null): void {
    if (this.renderer) {
      this.renderer.hoveredItem = product;
    }
  }

  setFocusedProduct(product: Product | null): void {
    if (this.renderer) {
      this.renderer.focusedItem = product;
    }
  }

         // Resize
         handleResize(): void {
           if (!this.canvas) return;

           // Get viewport size from canvas element itself (respects CSS insets like left/right)
           // Canvas may have insets applied (e.g., when footer is in sidebar mode)
           const parent = this.canvas.parentElement;
           if (!parent) {
             console.warn('Canvas has no parent element');
             return;
           }

           // Calculate actual available space considering CSS insets
           const computedStyle = window.getComputedStyle(this.canvas);
           const left = parseFloat(computedStyle.left) || 0;
           const right = parseFloat(computedStyle.right) || 0;
           const top = parseFloat(computedStyle.top) || 0;
           const bottom = parseFloat(computedStyle.bottom) || 0;

           const parentWidth = parent.clientWidth;
           const parentHeight = parent.clientHeight;

           // Calculate actual canvas dimensions after insets
           const viewportWidth = parentWidth - left - right;
           const viewportHeight = parentHeight - top - bottom;

           // Ensure we have valid dimensions
           if (viewportWidth <= 0 || viewportHeight <= 0) {
             console.warn('Canvas has invalid dimensions after insets', { viewportWidth, viewportHeight, left, right, top, bottom });
             return;
           }

           // Set canvas size to match calculated viewport
           this.canvas.width = viewportWidth;
           this.canvas.height = viewportHeight;

           console.log(`[Resize] parent=${parentWidth}x${parentHeight} insets L=${left} R=${right} → canvas=${viewportWidth}x${viewportHeight}`);

           // Layout uses viewport size
           this.layoutService.layout(viewportWidth, viewportHeight);
           this.updateContentBounds();
         }

  // Skeleton Animation
  private startSkeletonAnimation(): void {
    if (!this.skeletonRenderer) return;
    const loop = () => {
      if (this.skeletonRenderer && this.loading) {
        this.skeletonRenderer.draw(20);
        this.skeletonRafId = requestAnimationFrame(loop);
      }
    };
    loop();
  }

  private stopSkeletonAnimation(): void {
    if (this.skeletonRafId !== null) {
      cancelAnimationFrame(this.skeletonRafId);
      this.skeletonRafId = null;
    }
  }

  // State Listeners
  addListener(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  removeListener(listener: StateChangeListener): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  private notifyListeners(): void {
    const state: ControllerState = {
      loading: this.loading,
      error: this.error,
      products: this.products,
      filteredProducts: this.getFilteredProducts(),
      pivotGroups: this.layoutService.getPivotGroups(),
      familyGrouped: this._familyGrouped,
    };
    this.listeners.forEach(l => l(state));
  }

  // Utility
  getUniqueCategories(): string[] {
    return this.filterService.getUniqueCategories(this.products);
  }

  getUniqueSeasons(): number[] {
    return this.filterService.getUniqueSeasons(this.products);
  }

  // Developer Settings
  updateGridConfig(gridConfig: { spacing: number; margin: number; minCellSize: number; maxCellSize: number }): void {
    this.layoutService.updateGridConfig(gridConfig);
    this.handleResize(); // Re-layout with new config
  }
  
  setAnimationDuration(duration: number): void {
    this.layoutService.setAnimationDuration(duration);
  }
  
  setPriceBucketConfig(mode: PriceBucketMode, bucketCount: number): void {
    this.layoutService.setPriceBucketConfig(mode, bucketCount);
    this.onDataChanged();
  }

  setIgnoreBounds(ignore: boolean): void {
    const vt = this.viewportService.getTransform();
    if (vt) {
      vt.ignoreBounds = ignore;
    }
  }

  setCellSizeOverride(size: number): void {
    this.layoutService.setCellSizeOverride(size);
    this.handleResize();
  }

  setMinCellSize(size: number): void {
    this.layoutService.setMinCellSize(size);
    this.handleResize();
  }

  setProductLimit(limit: number): void {
    this._productLimit = limit;
    // Force reload GPANE engine with limited products
    let filtered = this.filterService.filterAndSort(this.products);
    filtered = this.favoritesService.filter(filtered);
    if (this._familyGrouped) {
      filtered = this.collapseByFamily(filtered);
    }
    if (filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }
    this.layoutService.forceReloadPivot(filtered);
    this.onDataChanged();
  }

  getZoom(): number {
    const viewport = this.viewportService.getTransform();
    return viewport?.scale ?? 1;
  }
  
  // === Pivot Drill-Down Methods ===
  
  setPivotDimension(dimension: GroupDimension): void {
    this.layoutService.setPivotDimension(dimension);
    this.onDataChanged();
  }
  
  getPivotDimension(): GroupDimension {
    return this.layoutService.getPivotDimension();
  }
  
  getPivotDimensions(): GroupDimension[] {
    return this.layoutService.getPivotDimensions();
  }

  getPivotDimensionDefinitions(): PivotDimensionDefinition[] {
    return this.layoutService.getPivotDimensionDefinitions();
  }

  getPivotDimensionLabel(dimension: GroupDimension): string {
    const def = this.layoutService.getPivotDimensionDefinitions().find(d => d.key === dimension);
    return def?.label ?? dimension;
  }

  getAvailablePivotDimensions(): GroupDimension[] {
    return this.layoutService.getAvailablePivotDimensions();
  }
  
  canUsePivotDimension(dimension: GroupDimension): boolean {
    return this.layoutService.canUsePivotDimension(dimension);
  }

  getPivotOrientation(): Orientation {
    return this.layoutService.getPivotOrientation();
  }

  setPivotOrientation(orientation: Orientation): void {
    this.layoutService.setPivotOrientation(orientation);
    this.onDataChanged();
  }
  
  drillDownPivot(value: string): void {
    this.layoutService.drillDownPivot(value);
    this.onPivotChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
    }
    this.ignoreNextHistoryPush = false;
  }

  drillUpPivot(): void {
    this.layoutService.drillUpPivot();
    this.onPivotChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
    }
    this.ignoreNextHistoryPush = false;
  }

  resetPivot(): void {
    this.layoutService.resetPivot();
    this.onPivotChanged();

    // Replace history state (don't push)
    const state = this.layoutService.getPivotBreadcrumbs();
    window.history.replaceState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
  }
  
  getPivotBreadcrumbs(): string[] {
    return this.layoutService.getPivotBreadcrumbs();
  }

  canDrillUpPivot(): boolean {
    return this.layoutService.canDrillUpPivot();
  }

  canDrillDownPivot(): boolean {
    return this.layoutService.canDrillDownPivot();
  }

  getPivotGroups(): PivotGroup[] {
    return this.layoutService.getPivotGroups();
  }

  isPivotHeroMode(): boolean {
    return this.layoutService.isPivotHeroMode();
  }

  getDisplayOrder(): Product[] {
    return this.layoutService.getDisplayOrder();
  }

  getDisplayOrderForGroup(groupKey: string): Product[] {
    return this.layoutService.getDisplayOrderForGroup(groupKey);
  }

  getGroupKeyForProduct(product: Product): string {
    return this.layoutService.getGroupKeyForProduct(product);
  }

  /**
   * Get layout node for a product
   */
  getProductNode(productId: string) {
    const nodes = this.layoutService.getEngine().all();
    const node = nodes.find(n => n.data.id === productId);
    if (node) {
      // Product node found
    } else {
      console.warn('[ProductFinderController] getProductNode NOT FOUND for id:', productId);
    }
    return node;
  }

  /**
   * Get viewport transform (scale, offset, etc.)
   */
  getViewportTransform() {
    return this.viewportService.getTransform();
  }

  /**
   * Get canvas renderer for direct manipulation (e.g., product overlay)
   */
  getRenderer() {
    return this.renderer;
  }

  drillDownGroup(groupKey: string): void {
    this.layoutService.drillDownPivot(groupKey);
    this.onDataChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
    }
    this.ignoreNextHistoryPush = false;
  }

  /**
   * Setup browser history integration for pivot drill-down
   * Back button = drill up, Forward button = restore state
   */
  private setupHistoryIntegration(): void {
    // Initialize history with current state
    const initialState = this.layoutService.getPivotBreadcrumbs();
    window.history.replaceState({ pivotDepth: initialState.length - 1, breadcrumbs: initialState }, '');

    // Handle browser back/forward
    this.historyPopStateHandler = (e: PopStateEvent) => {
      if (!e.state || e.state.pivotDepth === undefined) {
        // No pivot state, ignore
        return;
      }

      const targetDepth = e.state.pivotDepth;
      const currentDepth = this.layoutService.getPivotBreadcrumbs().length - 1;

      // Prevent pushing new history during restoration
      this.ignoreNextHistoryPush = true;

      if (targetDepth < currentDepth) {
        // Going back - drill up
        const steps = currentDepth - targetDepth;
        for (let i = 0; i < steps; i++) {
          if (this.layoutService.canDrillUpPivot()) {
            this.layoutService.drillUpPivot();
          }
        }
        this.onDataChanged();
      } else if (targetDepth > currentDepth) {
        // Going forward - would need to store drill path, for now just ignore
        // This is a limitation - we can't restore forward navigation
        console.warn('[ProductFinderController] Forward navigation not fully supported');
      }

      this.ignoreNextHistoryPush = false;
    };

    window.addEventListener('popstate', this.historyPopStateHandler);
  }
  
  /**
   * Handle click on canvas - check for group header clicks
   */
  handleGroupHeaderClick(canvasX: number, canvasY: number): boolean {
    if (!this.canvas || (this.layoutService.getMode() !== 'pivot' && this.layoutService.getMode() !== 'lanes')) return false;
    
    // Transform canvas coordinates to world coordinates
    const viewport = this.viewportService.getTransform();
    if (!viewport) return false;
    
    const worldX = (canvasX - viewport.offset.x) / viewport.scale;
    const worldY = (canvasY - viewport.offset.y) / viewport.scale;
    
    // Check if click is on any group header
    // On mobile, expand hit area by padding to make headers easier to tap
    const isMobile = this.canvas!.width < 768;
    const hitPadding = isMobile ? 10 : 0; // 10px extra tap area on mobile

    const headers = this.layoutService.getGroupHeaders();
    for (const header of headers) {
      if (worldX >= header.x - hitPadding && worldX <= header.x + header.width + hitPadding &&
          worldY >= header.y - hitPadding && worldY <= header.y + header.height + hitPadding) {
        // Click on group header - drill down!
        this.layoutService.drillDownPivot(header.key);
        this.onPivotChanged();
        return true;
      }
    }
    
    return false;
  }
  
  // === Family Grouping Methods ===

  /**
   * Collapse products by design_group: keep one representative per design.
   * Products with the same design_group are the same product in different colors.
   */
  private collapseByFamily(products: Product[]): Product[] {
    this._familyMap.clear();

    // Group by design_group (same product, different colors)
    for (const p of products) {
      const group = (p.raw as any)?.design_group || p.getAttributeValue<string>('product_code') || p.id;
      if (!this._familyMap.has(group)) {
        this._familyMap.set(group, []);
      }
      this._familyMap.get(group)!.push(p);
    }

    // Pick one representative per family (prefer one with image)
    const representatives: Product[] = [];
    for (const [, family] of this._familyMap) {
      const withImage = family.find(p => p.primaryImage?.storage_id);
      representatives.push(withImage || family[0]);
    }

    return representatives;
  }

  setFamilyGrouped(enabled: boolean): void {
    this._familyGrouped = enabled;
    this.onDataChanged();
  }

  isFamilyGrouped(): boolean {
    return this._familyGrouped;
  }

  /**
   * Handle mouse move - check for group header hover
   */
  handleGroupHeaderHover(canvasX: number, canvasY: number): string | null {
    if (!this.canvas || (this.layoutService.getMode() !== 'pivot' && this.layoutService.getMode() !== 'lanes')) return null;
    if (!this.layoutService.canDrillDownPivot()) return null;
    
    // Transform canvas coordinates to world coordinates
    const viewport = this.viewportService.getTransform();
    if (!viewport) return null;
    
    const worldX = (canvasX - viewport.offset.x) / viewport.scale;
    const worldY = (canvasY - viewport.offset.y) / viewport.scale;
    
    // Check if hover is on any group header
    const headers = this.layoutService.getGroupHeaders();
    for (const header of headers) {
      if (worldX >= header.x && worldX <= header.x + header.width &&
          worldY >= header.y && worldY <= header.y + header.height) {
        return header.key;
      }
    }
    
    return null;
  }
}
