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
      () => this.layoutService.getGroupHeaders()
    );

    // Setup favorites listener
    this.favoritesService.addListener(() => this.onDataChanged());

    // Initial resize to ensure canvas has correct size
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(() => this.handleResize(), 0);

    // Load products
    try {
      const results = await fetchProducts({ limit: 1000 });
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

  // Data Management
  private onDataChanged(): void {
    let filtered = this.filterService.filterAndSort(this.products);
    filtered = this.favoritesService.filter(filtered);

    const analyzerSource = filtered.length > 0 ? filtered : this.products;
    this.pivotModel = this.pivotAnalyzer.analyze(analyzerSource);
    this.layoutService.setPivotModel(this.pivotModel);

    this.layoutService.sync(filtered, analyzerSource);

    // Only re-layout, don't resize canvas
    // Canvas size should only change on actual window resize
    if (this.canvas) {
      this.layoutService.layout(this.canvas.width, this.canvas.height);

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
    // Use LayoutService's method which correctly uses targetValue for bounds
    const bounds = this.layoutService.getContentBounds();

    if (!bounds) {
      console.warn('[ProductFinderController] No content bounds available');
      return;
    }

    // Set content bounds on viewport
    this.viewportService.setContentBounds(bounds);

    // Different viewport behavior for hero mode (product presentation)
    const isHeroMode = this.layoutService.isPivotHeroMode();

    if (isHeroMode) {
      // Hero mode: Horizontal-only scrolling, scale 1.0, start at left
      this.viewportService.setLockVerticalPan(true);  // Lock vertical panning

      const viewport = this.viewportService.getTransform();
      if (viewport && this.canvas) {
        const scale = 1.0;
        const offsetX = -bounds.minX * scale;  // Start at left edge (first product visible)
        const offsetY = (this.canvas.height - bounds.height * scale) / 2 - bounds.minY * scale;  // Center vertically
        viewport.setImmediate(scale, offsetX, offsetY);
      }
    } else {
      // Normal mode: Enable vertical panning, fit all content
      this.viewportService.setLockVerticalPan(false);  // Enable vertical panning
      this.viewportService.resetToFitContent();
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

  // Hit Testing
  hitTest(screenX: number, screenY: number): Product | null {
    const worldPos = this.viewportService.screenToWorld(screenX, screenY);
    const nodes = this.layoutService.getEngine().all();
    
    for (const node of nodes) {
      const nx = node.posX.value ?? 0;
      const ny = node.posY.value ?? 0;
      const nw = node.width.value ?? 0;
      const nh = node.height.value ?? 0;
      
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
           
           // Get viewport size from parent or window
           const parent = this.canvas.parentElement;
           const viewportWidth = parent?.clientWidth || window.innerWidth;
           const viewportHeight = parent?.clientHeight || window.innerHeight;
           
           // Ensure we have valid dimensions
           if (viewportWidth === 0 || viewportHeight === 0) {
             console.warn('Canvas parent has zero dimensions, using window size');
             this.canvas.width = window.innerWidth;
             this.canvas.height = window.innerHeight;
             this.layoutService.layout(window.innerWidth, window.innerHeight);
             this.updateContentBounds();
             return;
           }

           // Set canvas size to match viewport
           this.canvas.width = viewportWidth;
           this.canvas.height = viewportHeight;

           console.log(`Canvas resized to: ${viewportWidth}x${viewportHeight}`);

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
    this.onDataChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
    }
    this.ignoreNextHistoryPush = false;
  }

  drillUpPivot(): void {
    this.layoutService.drillUpPivot();
    this.onDataChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ pivotDepth: state.length - 1, breadcrumbs: state }, '');
    }
    this.ignoreNextHistoryPush = false;
  }

  resetPivot(): void {
    this.layoutService.resetPivot();
    this.onDataChanged();

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
    if (!this.canvas || this.layoutService.getMode() !== 'pivot') return false;
    
    // Transform canvas coordinates to world coordinates
    const viewport = this.viewportService.getTransform();
    if (!viewport) return false;
    
    const worldX = (canvasX - viewport.offset.x) / viewport.scale;
    const worldY = (canvasY - viewport.offset.y) / viewport.scale;
    
    // Check if click is on any group header
    const headers = this.layoutService.getGroupHeaders();
    for (const header of headers) {
      if (worldX >= header.x && worldX <= header.x + header.width &&
          worldY >= header.y && worldY <= header.y + header.height) {
        // Click on group header - drill down!
        this.layoutService.drillDownPivot(header.key);
        this.onDataChanged();
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Handle mouse move - check for group header hover
   */
  handleGroupHeaderHover(canvasX: number, canvasY: number): string | null {
    if (!this.canvas || this.layoutService.getMode() !== 'pivot') return null;
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
