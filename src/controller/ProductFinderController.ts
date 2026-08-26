import type { Product } from '../types/Product';
import { FilterService, type FilterCriteria, type SortMode } from '../services/FilterService';
import { LayoutService, type LayoutMode } from '../services/LayoutService';
import { FavoritesService } from '../services/FavoritesService';
import { ViewportService } from '../services/ViewportService';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { SkeletonRenderer } from '../render/SkeletonRenderer';
import { ProductRenderAccessors } from '../layout/Accessors';
import { fetchProducts } from '../data/ProductRepository';
import type { GroupDimension, PriceBucketMode } from '../types/pivot';
import { PivotDimensionAnalyzer, type PivotAnalysisResult, type PivotDimensionDefinition } from '../services/PivotDimensionAnalyzer';
import type { Orientation } from '../layout/PivotLayouter';
import type { PivotGroup } from '../layout/PivotGroup';
import type { CatalogEntrySelection } from '../config/CatalogEntryConfig';
import { filterCatalogProducts, getCatalogCategory, stampCatalogCategory, findCatalogCategoryByLabel, catalogCategoryOrder, CATALOG_CATEGORY_ATTRIBUTE } from '../utils/catalogEntry';

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
  private catalogAll: Product[] = [];
  private globalSearchActive = false;
  private loading = true;
  private error: string | null = null;
  private listeners: StateChangeListener[] = [];

  // Family grouping
  private _familyGrouped = false;
  private _heroEntryKey: string | null = null;
  private _familyMap: Map<string, Product[]> = new Map();

  // Canvas
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // History integration
  private historyPopStateHandler: ((e: PopStateEvent) => void) | null = null;
  private ignoreNextHistoryPush = false;

  /** GPU mode: product images come from the WebGL layer (#260). */
  productsOnGpu = false;
  preConfig: {
    gridConfig?: { spacing: number; margin: number; minCellSize: number; maxCellSize: number };
    animationDuration?: number;
    priceBucketMode?: string;
    priceBucketCount?: number;
    minCellSize?: number;
    cellSizeOverride?: number;
    orientation?: Orientation;
    brand?: string;
    entrySelection?: CatalogEntrySelection;
  } = {};

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

    // Skip skeleton — preloader already cached all images before App renders

    // The Canvas2D renderer always runs: in GPU mode it draws the pivot
    // headers, hover, selection and labels while the WebGL layer beneath
    // draws the product images (#260). One header implementation, not two.
    {
    this.renderer = new CanvasRenderer<Product>(
      this.ctx,
      () => this.layoutService.getEngine().all(),
      this.renderAccess,
      this.viewportService.getTransform(),
      () => this.layoutService.getGroupHeaders(),
      () => this.layoutService.getPosterHeaders(),
      () => this.layoutService.getPivotDimension()
    );
    this.renderer.productsOnGpu = this.productsOnGpu;
    }

    // Setup favorites listener
    this.favoritesService.addListener(() => this.onDataChanged());

    // Initial resize to ensure canvas has correct size
    // Use setTimeout to ensure DOM is fully rendered
    setTimeout(() => this.handleResize(), 0);

    // Apply pre-config (without triggering layout)
    if (this.preConfig.gridConfig) {
      this.layoutService.updateGridConfig(this.preConfig.gridConfig);
    }
    if (this.preConfig.animationDuration !== undefined) {
      this.layoutService.setAnimationDuration(this.preConfig.animationDuration);
    }
    if (this.preConfig.priceBucketMode) {
      this.layoutService.setPriceBucketConfig(this.preConfig.priceBucketMode as any, this.preConfig.priceBucketCount ?? 5);
    }
    const minCellSize = this.preConfig.minCellSize;
    if (minCellSize !== undefined) {
      // LayoutService normalizes 0 -> undefined internally
      this.layoutService.setMinCellSize(minCellSize);
    }
    const cellSizeOverride = this.preConfig.cellSizeOverride;
    if (cellSizeOverride !== undefined) {
      this.layoutService.setCellSizeOverride(cellSizeOverride);
    }
    if (this.preConfig.orientation) {
      this.layoutService.setPivotOrientation(this.preConfig.orientation);
    }

    // Load products
    try {
      const results = await fetchProducts({ limit: 10000, brand: this.preConfig.brand });
      // Full brand universe (all sports/categories) — powers the global
      // search that must NOT be limited by the category gate (owner
      // 2026-08-24: "Search auf die gesamte Produktdatenbank").
      this.catalogAll = results || [];
      this.products = this.preConfig.entrySelection
        ? this.applyCatalogCategories(filterCatalogProducts(results || [], this.preConfig.entrySelection))
        : results || [];
      // The catalog entry has already answered "which sport" — the grid must
      // not ask it again. Filtering alone is not enough: accessories with
      // sport=MX+MTB (visors, screw sets) survive the ANY(sport) match and
      // give the analyzer two values to split on. Lock the dimension instead.
      const locked = this.preConfig.entrySelection ? ['sport'] : [];
      this.pivotAnalyzer.setExcludedDimensions(locked);
      // The entry category prescribes how the grid groups (series > model >
      // colour, the B2B shop's order). Scoring only fills in below that.
      const entryCategory = this.preConfig.entrySelection?.categoryId
        ? getCatalogCategory(this.preConfig.entrySelection.sportId, this.preConfig.entrySelection.categoryId)
        : undefined;
      // Ohne Kategorie-Gate (?catview=pivot|grouped|auto) ist die Kategorie
      // die erste Ebene im Finder — sonst startete das Scoring mit 'Preis'.
      this.layoutService.setGroupingPath(this.entryGroupingPath(entryCategory));
      // Two engines decide grouping: the legacy analyzer feeds the dimension
      // list, but the GPANE engine inside LayoutService picks the actual
      // split. Locking only the first one changed nothing on screen.
      this.layoutService.setLockedDimensions(locked);
      this.pivotModel = this.pivotAnalyzer.analyze(this.products);
      this.layoutService.setPivotModel(this.pivotModel);
      this.loading = false;
      this.stopSkeletonAnimation();
      if (this.renderer) this.renderer.start();

      this.onDataChanged();
      this.handleResize();
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
        this.renderer.isRootOverview = this.layoutService.isHeroRootOverview();
        this.syncProductLabels(isHero);
        // Column headers drop the prefix of the group we drilled into
        // ("3SRS Helmet STREAM" under "3SRS" -> "STREAM"); raw label, not
        // the already-shortened breadcrumb.
        this.syncRendererHeaderLabels();
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
        this.renderer.isRootOverview = this.layoutService.isHeroRootOverview();
        this.syncProductLabels(isHero);
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

    // Pass viewport size to LayoutService for fixed bounds calculation in Pivot Mode.
    // Hero mode extends the bounds so edge products can reach the viewport
    // centre — in WORLD units, so the extension has to be divided by the
    // zoom: at scale 0.45 (phone tap) a scale-1 extension clamped the first
    // product to the left edge (120518).
    const s = this.layoutService.isPivotHeroMode()
      ? Math.max(0.05, this.viewportService.getTransform()?.getTargetScale() ?? 1)
      : 1;
    const bounds = this.layoutService.getContentBounds(this.canvas.clientWidth / s, this.canvas.clientHeight / s);

    if (!bounds) {
      // No bounds available yet (e.g., during initial load) - this is normal
      return;
    }

    // Phone, card open: the sheet covers the lower half and the product is
    // centred in the band ABOVE it. Content smaller than the viewport gets
    // hard-centred by the clamp, which shoved the product back under the
    // sheet — extend the vertical bounds so the focal point is reachable.
    // NUR im Hero-Modus: im Pivot machte die Erweiterung mit stale
    // renderer.selectedProduct minY um -viewportHeight falsch und der
    // rows-Offset (-minY) schob die Kamera exakt eine Viewporthoehe nach
    // unten — weisser Screen nach Crumb-Navigation (media 120670/120671).
    if ((this.canvas?.clientWidth ?? 0) < 768 && this.renderer?.selectedProduct
        && this.layoutService.isPivotHeroMode()) {
      const vt = this.viewportService.getTransform();
      const sc = Math.max(0.05, vt?.getTargetScale() ?? 1);
      const ext = (this.canvas?.clientHeight ?? 600) / sc;
      bounds.minY -= ext;
      bounds.maxY += ext;
      (bounds as any).height = bounds.maxY - bounds.minY;
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
          w: this.canvas.clientWidth, h: this.canvas.clientHeight,
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

    const isPhone = (this.canvas?.clientWidth ?? 0) < 768;
    const isRootOverview = isHeroMode && !isPhone && this.layoutService.isHeroRootOverview();
    if (isRootOverview) {
      // Desktop category-root overview: fitted static grid — no paged
      // snapping, no dock shift, no first-product centring.
      this.viewportService.setLockVerticalPan(false);
      this.viewportService.setLockHorizontalPan(true);
      const vto = this.viewportService.getTransform();
      if (vto) {
        vto.snapResolver = null;
        vto.snapResolverY = null;
        vto.snapAnchorY = null;
        const entryKey = 'desk-overview:' + this.layoutService.getPivotBreadcrumbs().join('>');
        if (this._heroEntryKey !== entryKey) {
          this._heroEntryKey = entryKey;
          // EIN Kamera-Kommando pro Uebergang (owner 2026-08-25: 'einfache
          // Transitions'): die Bounds stammen bereits aus den Ziel-Targets,
          // der fruehere 350ms-Nachschlag erzeugte nur den zweiten Hub.
          vto.setPosition(0, 0, 1);
        }
      }
    } else if (isHeroMode && isPhone && this.layoutService.isHeroPresentation()) {
      // Phone hero presentation: same horizontal paging as desktop, one
      // product per swipe; vertical stays pinned to the band position.
      this.viewportService.setLockVerticalPan(true);
      this.viewportService.setLockHorizontalPan(false);
      const vtv = this.viewportService.getTransform();
      if (vtv) {
        vtv.snapResolverY = null;
        vtv.snapAnchorY = null;
        vtv.snapResolver = (centerWorldX, velocityX) => {
          const centers = this.heroProductCenters();
          if (centers.length === 0) return null;
          let nearest = 0;
          for (let i = 1; i < centers.length; i++) {
            if (Math.abs(centers[i] - centerWorldX) < Math.abs(centers[nearest] - centerWorldX)) nearest = i;
          }
          const FLICK = 6;
          if (velocityX < -FLICK) nearest = Math.min(centers.length - 1, nearest + 1);
          else if (velocityX > FLICK) nearest = Math.max(0, nearest - 1);
          return centers[nearest];
        };
      }
    } else if (isHeroMode && isPhone) {
      // Phone leaf grid (HeroLayouter.computePhoneGrid): vertical-only
      // scrolling — a two-column list must not wander sideways.
      this.viewportService.setLockVerticalPan(false);
      this.viewportService.setLockHorizontalPan(true);
      const vtp = this.viewportService.getTransform();
      if (vtp) {
        vtp.snapResolver = null;
        vtp.snapResolverY = null;
        vtp.snapAnchorY = null;
        // Snap to the top ONLY when this leaf was just entered.
        // updateContentBounds runs on every resize — iOS collapses the
        // toolbar while scrolling, which fired a resize, which snapped the
        // grid back to the top mid-scroll ("rauf runter", 2026-08-24).
        const entryKey = 'phone-grid:' + this.layoutService.getPivotBreadcrumbs().join('>');
        if (this._heroEntryKey !== entryKey) {
          this._heroEntryKey = entryKey;
          // Scale 1, start at top — EIN Kommando, kein 350ms-Nachschlag
          // (Doppelhub, owner 2026-08-25). Bounds kommen aus den Targets.
          vtp.setPosition(0, 0, 1);
        }
      }
    } else if (isHeroMode) {
      this._heroEntryKey = null;
      // Hero mode: Horizontal-only scrolling, scale 1.0 (no zoom)
      this.viewportService.setLockVerticalPan(true);
      this.viewportService.setLockHorizontalPan(false);
      // Start on the FIRST product, not the middle of the row. Centring the
      // row's midpoint put the viewport between products two and three of
      // four (owner report 2026-08-23, storage 120464/120465): the dealer
      // had just clicked a group whose first item is the one they saw on
      // top, and the hero view opened on a different helmet.
      const centers = this.heroProductCenters();
      const centerX = centers.length ? centers[0] : bounds.minX + bounds.width / 2;
      const centerY = bounds.minY + bounds.height / 2;
      this.viewportService.centerOn(centerX, centerY, 1);
      // Desktop: the card docks on the right, so the focal point is the
      // centre of the LEFT part of the stage, not the screen centre. Shift
      // the target offset by the dock width so the hero lands beside the card.
      const vtd = this.viewportService.getTransform();
      if (vtd && this.canvas && this.canvas.clientWidth >= 768) {
        const shift = this.heroDockShift();
        vtd.setPosition(vtd.getTargetOffset().x - shift, vtd.getTargetOffset().y, vtd.getTargetScale());
      }
      // Paged swiping: on release, settle on a product centre. A flick
      // (|velocity| above threshold) advances one product in its direction;
      // a slow drag snaps to whichever product is nearest the centre.
      const vt = this.viewportService.getTransform();
      if (vt) {
        vt.snapResolverY = null;
        vt.snapAnchorY = null;
        vt.snapResolver = (centerWorldX, velocityX) => {
          // centerWorldX is the screen centre; the focal point sits left of it.
          centerWorldX -= this.heroDockShift() / vt.getTargetScale();
          const centers = this.heroProductCenters();
          if (centers.length === 0) return null;
          let nearest = 0;
          for (let i = 1; i < centers.length; i++) {
            if (Math.abs(centers[i] - centerWorldX) < Math.abs(centers[nearest] - centerWorldX)) nearest = i;
          }
          const FLICK = 6; // px per frame at ~60fps; below this it is a drag, not a flick
          // Finger moves content: positive velocity = content moved right = previous product
          if (velocityX < -FLICK) nearest = Math.min(centers.length - 1, nearest + 1);
          else if (velocityX > FLICK) nearest = Math.max(0, nearest - 1);
          return centers[nearest] + this.heroDockShift() / vt.getTargetScale();
        };
      }
    } else if (isLanesMode) {
      this._heroEntryKey = null;
      // Lanes mode: Fixed scale 1.0, free vertical scrolling, start at top, no zoom-out
      this.viewportService.setLockVerticalPan(false);
      this.viewportService.setLockHorizontalPan(false);
      const vtl = this.viewportService.getTransform(); if (vtl) { vtl.snapResolver = null; vtl.snapResolverY = null; vtl.snapAnchorY = null; }
      const vt = this.viewportService.getTransform();
      if (vt) {
        vt.minScaleOverride = 0.8;
        vt.panWithLeftButton = true;
      }
      // CSS size, not the backing store: canvas.width is DPR-scaled by the
      // Canvas2D renderer (2x on desktop) and stays at the 300x150 default
      // under the GPU renderer, which has no reason to touch it. Either way
      // it is the wrong number for a viewport that works in CSS pixels.
      this.viewportService.centerOn(
        bounds.minX + (this.canvas?.clientWidth ?? 0) / 2,
        bounds.minY + (this.canvas?.clientHeight ?? 0) / 2,
        1,
      );
    } else {
      this._heroEntryKey = null;
      // Pivot mode: free panning
      this.viewportService.setLockVerticalPan(false);
      this.viewportService.setLockHorizontalPan(false);
      const vt = this.viewportService.getTransform();
      if (vt) vt.snapResolver = null;
      // CSS pixels — the viewport's unit. canvas.width/height is the backing
      // store: DPR-scaled under Canvas2D (1722 for an 861 px stage on a 2x
      // screen, so the start position sat half a page too low on phones)
      // and the untouched 300x150 default under the GPU renderer.
      const vw = this.canvas?.clientWidth ?? 800;
      const vh = this.canvas?.clientHeight ?? 600;

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
    this.reloadPivotWithCurrentFilter();
  }

  getFilterCriteria(): FilterCriteria {
    return this.filterService.getCriteria();
  }

  setAiFilterProductIds(ids: string[]): void {
    this.filterService.setIncludeIds(ids);
    this.reloadPivotWithCurrentFilter();
  }

  clearAiFilterProductIds(): void {
    this.filterService.clearIncludeIds();
    this.reloadPivotWithCurrentFilter();
  }

  /**
   * Recompute filtered set and force-reload the GPANE engine with it.
   * The engine's internal product list is otherwise loaded only once
   * (loadProducts has an early-return guard to preserve nav state on clicks).
   * Whenever the underlying filter changes we must explicitly forceReload.
   */
  private reloadPivotWithCurrentFilter(): void {
    let filtered = this.filterService.filterAndSort(this.products);
    filtered = this.favoritesService.filter(filtered);
    if (this._familyGrouped) {
      filtered = this.collapseByFamily(filtered);
    }
    if (filtered.length > this._productLimit) {
      filtered = filtered.slice(0, this._productLimit);
    }
    this.layoutService.forceReloadPivot(filtered);
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
  /**
   * Desktop hero dock: half the width the docked card takes (card 340 px +
   * 96 px right margin + 48 px gap) — the hero's focal point moves left by
   * this much. 0 on phones (no dock).
   */
  /**
   * Hoehe des freien Bands ueber dem Phone-Sheet in CSS-px, aus der DOM-
   * Geometrie: Sheet-Oberkante minus Canvas-Oberkante. Ist das Sheet noch
   * nicht montiert, Schaetzwert (Sheet ~52vh + 8px Rand).
   */
  private phoneFreeBandHeight(screenHeight: number): number {
    if (typeof document !== 'undefined' && this.canvas) {
      const sheet = document.querySelector<HTMLElement>('.pom-info-panel');
      if (sheet) {
        const top = sheet.getBoundingClientRect().top;
        const canvasTop = this.canvas.getBoundingClientRect().top;
        if (top > canvasTop + 60) return top - canvasTop;
      }
    }
    const inner = typeof window !== 'undefined' ? window.innerHeight : screenHeight;
    return screenHeight - (inner * 0.52 + 8);
  }

  /**
   * Phone: das Sheet ist montiert/gewachsen (ResizeObserver in App) —
   * Produkt neu ins jetzt bekannte Band zentrieren.
   */
  private _lastPhoneBandH = -1;

  refitPhoneBand(): void {
    if (!this.canvas || this.canvas.clientWidth >= 768) return;
    if (!this.layoutService.isHeroPresentation()) return;
    const product = this.renderer?.selectedProduct as Product | null | undefined;
    if (!product) return;
    // Nur bei ECHTER Aenderung des Bands nachzentrieren — der Aufruf kommt
    // aus einem ResizeObserver; ohne Guard schaukelt sich Refit -> Re-Render
    // -> Resize -> Refit zur Endlosschleife auf.
    const bandH = Math.round(this.phoneFreeBandHeight(this.canvas.clientHeight));
    if (Math.abs(bandH - this._lastPhoneBandH) < 2) return;
    this._lastPhoneBandH = bandH;
    this.centerOnProduct(product);
  }

  private heroDockShift(): number {
    const w = this.canvas?.clientWidth ?? 0;
    // Card column = 340 px card + 172 px right (margin + badge column) + 40 px inner gap.
    // The focal point moves left by half of that, so the product sits in
    // the centre of what remains.
    return w >= 768 ? (340 + 208 + 40) / 2 : 0;
  }

  /** World x of every hero product centre, sorted left to right. */
  /** Phone + hero presentation = the vertical column layout. */
  private isPhonePresentation(): boolean {
    return (this.canvas?.clientWidth ?? 0) < 768
      && this.layoutService.isPivotHeroMode()
      && this.layoutService.isHeroPresentation();
  }

  /** Free band height above the phone bottom sheet, in CSS px. */
  private phoneBandHeight(): number {
    const vt = this.viewportService.getTransform();
    const screenH = vt?.viewportHeight ?? (this.canvas?.clientHeight ?? 600);
    const sheetH = (typeof window !== 'undefined' ? window.innerHeight : screenH) * 0.52 + 8;
    return Math.max(120, screenH - sheetH);
  }

  private heroProductCenters(): number[] {
    return this.layoutService.getEngine().all()
      .filter(n => (n.opacity.targetValue ?? 1) > 0.01 && (n.width.targetValue ?? 0) > 0)
      .map(n => (n.posX.targetValue ?? 0) + (n.width.targetValue ?? 0) / 2)
      .sort((a, b) => a - b);
  }

  /**
   * Hero mode: move to the previous/next product. Used by the on-screen
   * arrows; shares the snap targets with the swipe so both agree on where
   * "next" is.
   */
  /** Hero mode: the product at position i (left to right), or null. */
  getHeroProductAt(index: number): Product | null {
    const centre = (n: any) => (n.posX.targetValue ?? 0) + (n.width.targetValue ?? 0) / 2;
    const nodes = this.layoutService.getEngine().all()
      .filter(n => (n.opacity.targetValue ?? 1) > 0.01 && (n.width.targetValue ?? 0) > 0)
      .sort((a, b) => centre(a) - centre(b));
    return nodes[index]?.data ?? null;
  }

  /** Hero mode: index of the product nearest the viewport centre (target), and count. */
  getHeroPosition(): { index: number; count: number } | null {
    const vt = this.viewportService.getTransform();
    if (!vt || !this.layoutService.isPivotHeroMode()) return null;
    const centers = this.heroProductCenters();
    if (centers.length === 0) return null;
    const cx = (vt.viewportWidth / 2 - this.heroDockShift() - vt.getTargetOffset().x) / vt.getTargetScale();
    let nearest = 0;
    for (let i = 1; i < centers.length; i++) {
      if (Math.abs(centers[i] - cx) < Math.abs(centers[nearest] - cx)) nearest = i;
    }
    return { index: nearest, count: centers.length };
  }

  stepHeroProduct(direction: -1 | 1): boolean {
    const vt = this.viewportService.getTransform();
    if (!vt || !this.layoutService.isPivotHeroMode()) return false;
    const centers = this.heroProductCenters();
    if (centers.length === 0) return false;
    const shift = this.heroDockShift() / vt.getTargetScale();
    const centerWorldX = (vt.viewportWidth / 2 - vt.getTargetOffset().x) / vt.getTargetScale() - shift;
    let nearest = 0;
    for (let i = 1; i < centers.length; i++) {
      if (Math.abs(centers[i] - centerWorldX) < Math.abs(centers[nearest] - centerWorldX)) nearest = i;
    }
    const next = Math.max(0, Math.min(centers.length - 1, nearest + direction));
    if (next === nearest) return false;
    vt.centerOn(centers[next] + shift, (vt.viewportHeight / 2 - vt.getTargetOffset().y) / vt.getTargetScale());
    return true;
  }

  centerOnProduct(product: Product): void {
    const viewport = this.viewportService.getTransform();
    if (!viewport) return;

    // Overview grid -> hero presentation: switch the layouter so all nodes
    // animate sideways into the hero row, THEN centre the clicked one.
    if (this.layoutService.isPivotHeroMode()
        && this.layoutService.isHeroRootOverview()) {
      this.layoutService.setHeroPresentation(true);
      this._heroEntryKey = null;
      this.handleResize();
      this.syncProductLabels(true);

      // ANKER-RELATIVES LAYOUT (owner 2026-08-25): Das geklickte Produkt
      // soll von seiner AKTUELLEN Position auf kuerzestem Weg ins Zentrum —
      // nicht quer zum absoluten Row-Anfang. Also wird die frische Hero-Row
      // so verschoben, dass der Anker in der Welt stehen bleibt; die
      // Nachbarn ordnen sich UM ihn an und die Kamera macht nur noch den
      // Zoom-Glide auf den Anker statt einer Querfahrt.
      const rowNodes = this.layoutService.getEngine().all();
      const anchor = rowNodes.find(n => n.data.id === product.id);
      if (anchor) {
        const curCX = (anchor.posX.value ?? anchor.posX.targetValue ?? 0)
          + (anchor.width.value ?? anchor.width.targetValue ?? 0) / 2;
        const curCY = (anchor.posY.value ?? anchor.posY.targetValue ?? 0)
          + (anchor.height.value ?? anchor.height.targetValue ?? 0) / 2;
        const tgtCX = (anchor.posX.targetValue ?? 0) + (anchor.width.targetValue ?? 0) / 2;
        const tgtCY = (anchor.posY.targetValue ?? 0) + (anchor.height.targetValue ?? 0) / 2;
        const dx = curCX - tgtCX;
        const dy = curCY - tgtCY;
        if (dx !== 0 || dy !== 0) {
          for (const n of rowNodes) {
            n.posX.targetValue = (n.posX.targetValue ?? 0) + dx;
            n.posY.targetValue = (n.posY.targetValue ?? 0) + dy;
          }
        }
      }
    }

    // Find the node for this product
    const nodes = this.layoutService.getEngine().all();
    const node = nodes.find(n => n.data.id === product.id);

    if (!node) {
      console.warn('[ProductFinderController] Product node not found for centering');
      return;
    }

    // DESTINATION, not the mid-animation position: the row layout was just
    // applied as targets.
    const x = node.posX.targetValue ?? node.posX.value ?? 0;
    const y = node.posY.targetValue ?? node.posY.value ?? 0;
    const w = node.width.targetValue ?? node.width.value ?? 0;
    const h = node.height.targetValue ?? node.height.value ?? 0;

    const centerX = x + w / 2;
    const centerY = y + h / 2;

    // Calculate hero zoom: product should take a portion of screen height
    const screenHeight = viewport.viewportHeight;
    const screenWidth = viewport.viewportWidth;
    const isMobile = screenWidth < 768;
    // Desktop: leave room BELOW the product for its caption (name + price)
    // — at 0.9 the caption fell off the bottom edge (120532).
    const fillRatio = isMobile ? 0.6 : 0.78;
    let targetScale = (screenHeight * fillRatio) / h;

    // Desktop hero dock (design 2026-08-23): the dark card occupies the right
    // ~480 px. The product must fit the stage LEFT of it — height alone let
    // a 1.3:1 helmet grow to 900 px and run under the card.
    const dockShift = this.heroDockShift();
    if (!isMobile && dockShift > 0 && w > 0) {
      const leftStage = screenWidth - dockShift * 2; // width free of the card
      targetScale = Math.min(targetScale, (leftStage * 0.78) / w);
    }

    // Phone: the card is a bottom sheet (48vh, see ProductOverlayModalV2).
    // The product has to fit the stage ABOVE it — 60 % of the full height
    // shoved upward put the helmet half under the sheet and half under the
    // header (120518). Fit into the free band, centre it there.
    let focusY = centerY;
    if (!isMobile && h > 0) {
      // Nudge the product up a little so the caption band clears the
      // arrows/counter at the bottom.
      focusY = centerY + h * 0.06;
    }
    if (isMobile && h > 0 && w > 0) {
      // Freies Band = Canvas-Oberkante bis Sheet-Oberkante, GEMESSEN — der
      // 52vh-Schaetzwert traf das echte Sheet (~40 % bei kurzen Karten)
      // nicht: Produkt klebte oben, Luecke darunter (media 120703).
      const freeH = Math.max(120, this.phoneFreeBandHeight(screenHeight));
      // Presentation goes one product per page — the camera can go close
      // (owner 2026-08-24, 120602): fill the band almost completely.
      targetScale = Math.min((freeH * 0.95) / h, (screenWidth * 0.94) / w);
      // World point that must land on the screen centre so that the product
      // centre lands at freeH / 2.
      focusY = centerY + (screenHeight / 2 - freeH / 2) / targetScale;
    }

    const clampedScale = Math.min(targetScale, viewport.maxScale);
    this.viewportService.centerOn(centerX, focusY, clampedScale);
    // Bounds depend on the target zoom (see updateContentBounds).
    this.updateContentBounds();
    this.viewportService.centerOn(centerX, focusY, clampedScale);
    // Desktop dock: focal point is the centre of the left stage, not the screen.
    if (!isMobile && dockShift > 0) {
      const t = viewport.getTargetOffset();
      viewport.setPosition(t.x - dockShift, t.y, clampedScale);
    }
  }

  // Hit Testing
  /** 1x1-Canvas fuer das Alpha-Sampling im Poster-Hit-Test. */
  private alphaProbe: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

  /**
   * Deckt der Klickpunkt ein OPAKES Pixel des Produktbilds? Die Rects der
   * Poster-Stapel ueberlappen stark und die Bilder haben grosse
   * transparente Raender — der reine Rechteck-Test traf den durchsichtigen
   * Rand des Nachbarn statt der sichtbaren Hose (media 120657/120658).
   * Fit-Mathematik identisch zu CanvasRenderer.drawImageFit (contain+center).
   */
  private hitsOpaquePixel(node: any, worldX: number, worldY: number,
    nx: number, ny: number, nw: number, nh: number): boolean | null {
    const img = (node.data as any)?.image as HTMLImageElement | undefined;
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const fit = Math.min(nw / img.naturalWidth, nh / img.naturalHeight);
    const dw = img.naturalWidth * fit;
    const dh = img.naturalHeight * fit;
    const dx = nx + (nw - dw) / 2;
    const dy = ny + (nh - dh) / 2;
    if (worldX < dx || worldX > dx + dw || worldY < dy || worldY > dy + dh) return false;
    try {
      if (!this.alphaProbe) {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        this.alphaProbe = { canvas, ctx };
      }
      const px = Math.min(img.naturalWidth - 1, Math.max(0, Math.floor((worldX - dx) / fit)));
      const py = Math.min(img.naturalHeight - 1, Math.max(0, Math.floor((worldY - dy) / fit)));
      this.alphaProbe.ctx.clearRect(0, 0, 1, 1);
      this.alphaProbe.ctx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1);
      return this.alphaProbe.ctx.getImageData(0, 0, 1, 1).data[3] > 16;
    } catch {
      // Tainted canvas (CORS): kein Sampling moeglich -> Rechteck zaehlt
      return null;
    }
  }

  hitTest(screenX: number, screenY: number): Product | null {
    const worldPos = this.viewportService.screenToWorld(screenX, screenY);
    const nodes = this.layoutService.getEngine().all();

    // REVERSE iteration: last rendered = on top = should be found first
    const candidates: Array<{ node: any; nx: number; ny: number; nw: number; nh: number }> = [];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const nx = node.posX.targetValue ?? node.posX.value ?? 0;
      const ny = node.posY.targetValue ?? node.posY.value ?? 0;
      const nw = node.width.targetValue ?? node.width.value ?? 0;
      const nh = node.height.targetValue ?? node.height.value ?? 0;

      if (worldPos.x >= nx && worldPos.x <= nx + nw && worldPos.y >= ny && worldPos.y <= ny + nh) {
        candidates.push({ node, nx, ny, nw, nh });
      }
    }
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0].node.data;

    // Ueberlappende Rects (Poster-Stapel): oberster Kandidat mit OPAKEM
    // Pixel am Klickpunkt gewinnt; ohne verwertbares Sampling gilt die
    // alte Topmost-Regel.
    for (const candidate of candidates) {
      const opaque = this.hitsOpaquePixel(candidate.node, worldPos.x, worldPos.y,
        candidate.nx, candidate.ny, candidate.nw, candidate.nh);
      if (opaque === null) return candidate.node.data;
      if (opaque) return candidate.node.data;
    }
    return candidates[0].node.data;
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

           // Backing-store sizing is owned by CanvasRenderer.draw()
           // (DPR-aware); the CSS box is defined by inset/insets.

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
  getAllProducts(): Product[] {
    return this.products;
  }

  /** Every product of the brand, ignoring the category gate. */
  getCatalogAllProducts(): Product[] {
    return this.catalogAll.length ? this.catalogAll : this.products;
  }

  isGlobalSearchActive(): boolean {
    return this.globalSearchActive;
  }

  /**
   * Global search mode: the working set becomes the matches across the
   * WHOLE catalog (all categories/sports); the pivot engine re-scores
   * generic dimensions over it. null restores the category set.
   */
  setGlobalSearchProducts(matches: Product[] | null): void {
    const entryCategory = this.preConfig.entrySelection?.categoryId
      ? getCatalogCategory(this.preConfig.entrySelection.sportId, this.preConfig.entrySelection.categoryId)
      : undefined;
    if (matches && matches.length) {
      this.globalSearchActive = true;
      this.products = matches;
      // Generic scoring instead of the category's prescribed order —
      // search results span categories.
      this.layoutService.setGroupingPath([]);
    } else {
      this.globalSearchActive = false;
      this.products = this.preConfig.entrySelection
        ? this.applyCatalogCategories(filterCatalogProducts(this.catalogAll, this.preConfig.entrySelection))
        : this.catalogAll;
      this.layoutService.setGroupingPath(this.entryGroupingPath(entryCategory));
    }
    // New universe: the engine must reload, not just re-filter.
    (this.layoutService as any).drillDownService.forceReload(this.products);
    this.layoutService.resetPivot();
    this._heroEntryKey = null;
    this.onDataChanged();
  }

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
    this.syncRendererHeaderLabels();
    this.onDataChanged();
  }

  /**
   * Hero caption on by default (owner 2026-08-23: the lanes-style
   * category/name/price line under the product should not need the lanes
   * toggle). Runs from BOTH onDataChanged and onPivotChanged — the drill
   * into hero goes through the latter only, which is why the first
   * version (onDataChanged only) never showed the caption.
   */
  private syncProductLabels(isHero: boolean): void {
    if (!this.renderer || this.layoutService.getMode() === 'lanes') return;
    if (isHero) {
      // Phone: the category line is noise on a leaf that is all one type.
      const phone = (this.canvas?.clientWidth ?? 0) < 768;
      // Phone presentation: the sheet below carries name/price — the canvas
      // caption would duplicate it in the small band (owner 2026-08-24).
      if (phone && this.layoutService.isHeroPresentation()) {
        this.renderer.productLabels.enabled = false;
        return;
      }
      // Poster-Overview (Prototyp): Captions kollidieren mit den
      // ueberlappenden Stapeln — der Modell-Header traegt die Information,
      // Details kommen per Hover/Karte.
      if (this.layoutService.isPosterOverview()) {
        this.renderer.productLabels.enabled = false;
        return;
      }
      this.renderer.productLabels.update({
        enabled: true,
        fields: phone ? ['name', 'price'] : ['category', 'name', 'price'],
        position: 'below',
        nameColor: 'rgba(0, 0, 0, 0.85)',
        detailColor: 'rgba(0, 0, 0, 0.45)',
        priceColor: '#ff6b00',
      });
    } else {
      this.renderer.productLabels.enabled = false;
    }
  }

  /** Column-header labelling context for the renderer (parent prefix + noise-word rule). */
  private syncRendererHeaderLabels(): void {
    if (!this.renderer) return;
    const stack = (this.layoutService as any).drillDownService?.engine?.navigationStack as { label: string }[] | undefined;
    this.renderer.headerParentLabel = stack && stack.length ? stack[stack.length - 1].label : null;
    // Noise words ("Pants", "Helmet") are only noise inside product
    // names. In a category bucket they ARE the label: "Pants MX"
    // stripped to "MX" read like a sport (2026-08-23).
    const dim = this.layoutService.getPivotDimension() as string;
    this.renderer.headerStripNoise = dim === 'design_group' || dim === 'product_line' || dim === 'model' || dim === 'series';
  }
  
  getPivotDimension(): GroupDimension {
    return this.layoutService.getPivotDimension();
  }
  
  isHeroRootOverview(): boolean {
    return this.layoutService.isHeroRootOverview() && (this.canvas?.clientWidth ?? 0) >= 768;
  }

  /** Card closed: the hero row flows back into the overview grid. */
  exitHeroPresentation(): void {
    if (!this.layoutService.isHeroPresentation()) return;
    this.layoutService.setHeroPresentation(false);
    this._heroEntryKey = null;
    this.handleResize();
    this.syncProductLabels(this.layoutService.isPivotHeroMode());
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
  
  /**
   * Ein History-Eintrag pro Aktion (owner 2026-08-25: Browser-Back soll
   * JEDE Aktion rueckgaengig machen): traegt neben der Tiefe den ROHEN
   * Bucket-Pfad (fuer laterale/vorwaerts Restores per drillDown) und den
   * Sicht-Override des Pivot/Grouped-Switch.
   */
  private pushPivotHistory(mode: 'push' | 'replace' = 'push'): void {
    if (mode === 'push' && this.ignoreNextHistoryPush) { this.ignoreNextHistoryPush = false; return; }
    const crumbs = this.layoutService.getPivotBreadcrumbs();
    const state = {
      ...(window.history.state ?? {}),
      pivotDepth: crumbs.length - 1,
      breadcrumbs: crumbs,
      rawTrail: this.layoutService.getPivotRawTrail(),
      viewOverride: this.layoutService.getViewOverride(),
    };
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '');
  }

  drillDownPivot(value: string): void {
    if (this.renderer) { this.renderer.selectedProduct = null; }
    this.layoutService.drillDownPivot(value);
    this.onPivotChanged();
    this.pushPivotHistory();
  }

  /** Header-Switch Pivot-Spalten <-> Grouped-View (media 120646). */
  /** Vorgeschriebene Gruppierung: Kategorie-Config, sonst Kategorie selbst als Ebene 0. */
  private entryGroupingPath(entryCategory: { grouping?: string[] } | undefined): string[] {
    if (entryCategory?.grouping) return entryCategory.grouping;
    if (this.preConfig.entrySelection && !this.preConfig.entrySelection.categoryId) return [CATALOG_CATEGORY_ATTRIBUTE];
    return [];
  }

  /**
   * Ohne Kategorie-Gate (?catview=pivot|grouped|auto): dieselben Katalog-
   * Kategorien wie im Gate werden zur Wurzel-Dimension — nicht die rohen
   * ERP-Kategorien (owner 2026-08-26: "das sind zwei verschiedene Sichten").
   * Produkte ohne Katalog-Kategorie zeigt auch das Gate nicht — raus.
   * Unterhalb einer Kategorie gilt deren konfigurierte Gruppierung.
   */
  private applyCatalogCategories(products: Product[]): Product[] {
    const selection = this.preConfig.entrySelection;
    if (!selection || selection.categoryId) {
      this.layoutService.setGroupingResolver(null);
      return products;
    }
    const sportId = selection.sportId;
    const kept = stampCatalogCategory(products, sportId);
    this.layoutService.setCatalogCategoryOrder(catalogCategoryOrder(sportId));
    this.layoutService.setGroupingResolver(focus => {
      const root = focus[0];
      if (!root || root.dimension !== CATALOG_CATEGORY_ATTRIBUTE) return null;
      const category = findCatalogCategoryByLabel(sportId, root.bucketLabel);
      return [CATALOG_CATEGORY_ATTRIBUTE, ...(category?.grouping ?? [])];
    });
    return kept;
  }

  setViewOverride(override: 'auto' | 'pivot' | 'grouped'): void {
    this.layoutService.setViewOverride(override);
    this.onPivotChanged();
    this.handleResize();
    // Auch der Sicht-Wechsel ist eine Back-Button-faehige Aktion.
    this.pushPivotHistory();
  }

  getViewOverride(): 'auto' | 'pivot' | 'grouped' {
    return this.layoutService.getViewOverride();
  }

  /** Gibt es an dieser Ebene ueberhaupt >1 Bucket fuer eine Pivot-Sicht? */
  canShowPivotColumns(): boolean {
    return this.layoutService.getCurrentBuckets().filter((b: any) => !b.isUnknown).length >= 2;
  }

  /**
   * Grouped-View: Klick auf ein Produkt filtert auf dessen Gruppe —
   * eine echte Pivot-Action (drillDown auf das Engine-Bucket), statt alle
   * Produkte der Ebene in den Hero-Mode zu fahren (media 120646).
   */
  drillIntoProductGroup(product: Product): boolean {
    const buckets = this.layoutService.getCurrentBuckets().filter((b: any) => !b.isUnknown);
    if (buckets.length < 2) return false;
    const id = String(product.id);
    const bucket = buckets.find((b: any) => b.objectIds.includes(id));
    if (!bucket) return false;
    this.drillDownPivot(bucket.label);
    return true;
  }

  /**
   * Poster-Header-Klick (world-space Hit-Test) -> Pivot-Drill in die Gruppe.
   */
  handlePosterHeaderClick(canvasX: number, canvasY: number): boolean {
    const headers = this.layoutService.getPosterHeaders();
    if (!headers.length) return false;
    const vt = this.viewportService.getTransform();
    if (!vt) return false;
    const worldX = (canvasX - vt.offset.x) / vt.scale;
    const worldY = (canvasY - vt.offset.y) / vt.scale;
    for (const header of headers) {
      const w = header.maxWidth ?? 220;
      if (worldX >= header.x && worldX <= header.x + w && worldY >= header.y - 24 && worldY <= header.y + 8) {
        const raw = (header as any).raw ?? header.text;
        if (raw === 'WEITERE') return false;
        this.drillDownPivot(raw);
        return true;
      }
    }
    return false;
  }

  getPivotBreadcrumbSiblings(): string[][] {
    return this.layoutService.getPivotBreadcrumbSiblings();
  }

  /**
   * Explorer-Dropdown im Breadcrumb (owner 2026-08-25): auf Ebene `index`
   * direkt zum Geschwister-Bucket wechseln, ohne manuell zurueckzugehen —
   * hoch bis vor die Ebene, dann in die Alternative drillen.
   */
  switchPivotBreadcrumb(index: number, siblingLabel: string): void {
    const crumbs = this.layoutService.getPivotBreadcrumbs();
    if (index < 1 || index >= crumbs.length) return;
    const levelsToRemove = crumbs.length - index;
    for (let i = 0; i < levelsToRemove; i++) {
      this.layoutService.drillUpPivot();
    }
    this.layoutService.drillDownPivot(siblingLabel);
    this.onPivotChanged();
    this.pushPivotHistory();
  }

  drillUpPivot(): void {
    if (this.renderer) { this.renderer.selectedProduct = null; }
    this.layoutService.drillUpPivot();
    this.onPivotChanged();
    this.pushPivotHistory();
  }

  resetPivot(): void {
    if (this.renderer) { this.renderer.selectedProduct = null; }
    this.layoutService.resetPivot();
    this.onPivotChanged();
    this.pushPivotHistory('replace');
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

  handleGroupHeaderClick_byLabel(label: string): void {
    this.layoutService.drillDownPivot(label);
    this.onPivotChanged();
  }

  getLayoutEngine() {
    return this.layoutService.getEngine();
  }

  getLayoutService() {
    return this.layoutService;
  }

  drillDownGroup(groupKey: string): void {
    this.layoutService.drillDownPivot(groupKey);
    this.onDataChanged();

    // Push history state for browser back button
    if (!this.ignoreNextHistoryPush) {
      const state = this.layoutService.getPivotBreadcrumbs();
      window.history.pushState({ ...(window.history.state ?? {}), pivotDepth: state.length - 1, breadcrumbs: state }, '');
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
    this.pushPivotHistory('replace');

    // Handle browser back/forward
    this.historyPopStateHandler = (e: PopStateEvent) => {
      if (!e.state || e.state.pivotDepth === undefined) {
        // No pivot state, ignore
        return;
      }

      // Prevent pushing new history during restoration
      this.ignoreNextHistoryPush = true;

      const targetTrail: string[] | undefined = e.state.rawTrail;
      if (targetTrail && targetTrail.length) {
        // Voller Pfad-Restore (2026-08-25): hoch bis zum gemeinsamen
        // Praefix, dann den Ziel-Pfad runterdrillen — damit macht Back
        // auch laterale Wechsel (Breadcrumb-Dropdown) und Vorwaerts-
        // Navigation rueckgaengig, nicht nur Tiefe.
        const currentTrail = this.layoutService.getPivotRawTrail();
        let common = 0;
        while (common < Math.min(currentTrail.length, targetTrail.length)
          && currentTrail[common] === targetTrail[common]) common++;
        for (let i = currentTrail.length; i > common; i--) {
          if (this.layoutService.canDrillUpPivot()) this.layoutService.drillUpPivot();
          else break;
        }
        for (let i = common; i < targetTrail.length; i++) {
          this.layoutService.drillDownPivot(targetTrail[i]);
        }
      } else {
        const targetDepth = e.state.pivotDepth;
        const currentDepth = this.layoutService.getPivotBreadcrumbs().length - 1;
        if (targetDepth < currentDepth) {
          const steps = currentDepth - targetDepth;
          for (let i = 0; i < steps; i++) {
            if (this.layoutService.canDrillUpPivot()) {
              this.layoutService.drillUpPivot();
            }
          }
        }
      }

      // Sicht-Override des Eintrags wiederherstellen (drillDown reset
      // ihn auf 'auto', deshalb NACH den Drills).
      this.layoutService.setViewOverride(e.state.viewOverride ?? 'auto');

      this.onPivotChanged();
      this.onDataChanged();
      this.handleResize();
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
        // Click on group header - drill down! Push a history entry like
        // every other drill path — canvas drills previously left none, so
        // browser-back jumped past them to the last pushed depth.
        this.layoutService.drillDownPivot(header.key);
        this.onPivotChanged();
        this.pushPivotHistory();
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
