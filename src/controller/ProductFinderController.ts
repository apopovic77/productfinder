import type { Product } from '../types/Product';
import { FilterService, type FilterCriteria, type SortMode } from '../services/FilterService';
import { LayoutService, type LayoutMode } from '../services/LayoutService';
import { FavoritesService } from '../services/FavoritesService';
import { ViewportService } from '../services/ViewportService';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { SkeletonRenderer } from '../render/SkeletonRenderer';
import { ProductRenderAccessors } from '../layout/Accessors';
import { fetchProducts } from '../data/ProductRepository';

export type ControllerState = {
  loading: boolean;
  error: string | null;
  products: Product[];
  filteredProducts: Product[];
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

  // State
  private products: Product[] = [];
  private loading = true;
  private error: string | null = null;
  private listeners: StateChangeListener[] = [];

  // Canvas
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    if (!this.ctx) {
      throw new Error('Failed to get 2D context');
    }

    // Initialize viewport
    this.viewportService.initialize(canvas);

    // Initialize skeleton renderer
    this.skeletonRenderer = new SkeletonRenderer(this.ctx);
    this.startSkeletonAnimation();

    // Initialize main renderer
    this.renderer = new CanvasRenderer<Product>(
      this.ctx,
      () => this.layoutService.getEngine().all(),
      this.renderAccess,
      this.viewportService.getTransform()
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
  }

  // Data Management
  private onDataChanged(): void {
    let filtered = this.filterService.filterAndSort(this.products);
    filtered = this.favoritesService.filter(filtered);
    
    this.layoutService.sync(filtered);
    
    // Only re-layout, don't resize canvas
    // Canvas size should only change on actual window resize
    if (this.canvas) {
      this.layoutService.layout(this.canvas.width, this.canvas.height);
    }
    
    this.notifyListeners();
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
             return;
           }
           
           // Set canvas size to match viewport
           this.canvas.width = viewportWidth;
           this.canvas.height = viewportHeight;
           
           console.log(`Canvas resized to: ${viewportWidth}x${viewportHeight}`);
           
           // Layout uses viewport size
           this.layoutService.layout(viewportWidth, viewportHeight);
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
}

