import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import ProductModal from './components/ProductModal';
import { ProductAnnotations } from './components/ProductAnnotations';
import { ProductOverlay } from './components/ProductOverlay';
import { ProductOverlayModal } from './components/ProductOverlayModal';
import { AnimatePresence } from 'framer-motion';
import { DeveloperOverlay, type DeveloperSettings } from './components/DeveloperOverlay';
import { CustomSelect } from './components/CustomSelect';
import type { SortMode } from './services/FilterService';
import type { LayoutMode } from './services/LayoutService';
import type { GroupDimension } from './services/PivotDrillDownService';
import type { Orientation } from './layout/PivotLayouter';
import type { PivotGroup } from './layout/PivotGroup';
import type { PivotDimensionDefinition } from './services/PivotDimensionAnalyzer';
import {
  createDefaultDeveloperSettings,
  createDefaultFilterState,
  createDefaultPivotState,
  createDefaultUiState,
} from './config/AppConfig';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type State = {
  loading: boolean;
  error: string | null;
  filteredProducts: Product[];
  
  // UI State
  search: string;
  category: string;
  season: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
  sortMode: SortMode;
  layoutMode: LayoutMode;
  showOnlyFavorites: boolean;
  showFilters: boolean;
  
  // Pivot State
  pivotDimension: GroupDimension;
  pivotBreadcrumbs: string[];
  pivotDimensions: GroupDimension[];
  pivotOrientation: Orientation;
  pivotGroups: PivotGroup[];
  pivotDefinitions: PivotDimensionDefinition[];
  isPivotHeroMode: boolean;
  
  // Interaction State
  selectedProduct: Product | null;
  selectedIndex: number;
  modalDirection: number;
  modalSequence: string[];
  hoveredProduct: Product | null;
  mousePos: { x: number; y: number } | null;
  focusedIndex: number;
  mobileFooterExpanded: boolean;

  // Overlay Mode
  overlayMode: 'canvas' | 'react'; // Toggle between canvas and React overlay
  showReactDialog: boolean; // Show dialog when zoom is stable
  isZoomAnimating: boolean; // Track if zoom is currently animating

  // Developer Settings
  devSettings: DeveloperSettings;
  fps: number;
  zoom: number;
};

const createInitialState = (): State => {
  const filters = createDefaultFilterState();
  const ui = createDefaultUiState();
  const pivot = createDefaultPivotState();

  return {
    loading: true,
    error: null,
    filteredProducts: [],

    search: filters.search,
    category: filters.category,
    season: filters.season,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    weightMin: filters.weightMin,
    weightMax: filters.weightMax,
    sortMode: ui.sortMode,
    layoutMode: ui.layoutMode,
    showOnlyFavorites: ui.showOnlyFavorites,
    showFilters: ui.showFilters,

    pivotDimension: pivot.dimension,
    pivotBreadcrumbs: [pivot.rootBreadcrumb],
    pivotDimensions: [],
    pivotOrientation: 'columns',
    pivotGroups: [],
    pivotDefinitions: [],
    isPivotHeroMode: false,

    selectedProduct: null,
    selectedIndex: -1,
    modalDirection: 0,
    modalSequence: [],
    hoveredProduct: null,
    mousePos: null,
    focusedIndex: -1,

    overlayMode: 'react', // Default to React overlay
    showReactDialog: false,
    isZoomAnimating: false,

    devSettings: createDefaultDeveloperSettings(),
    fps: 60,
    zoom: 1,
    mobileFooterExpanded: false,
  };
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private controller = new ProductFinderController();
  private fpsRaf: number | null = null;
  private fpsLastSample = 0;
  private fpsFrameCount = 0;
  private zoomStabilityTimer: number | null = null;

  state: State = createInitialState();

  async componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Initialize controller
    await this.controller.initialize(canvas);
    this.controller.updateGridConfig(this.state.devSettings.gridConfig);
    this.controller.setAnimationDuration(this.state.devSettings.animationDuration);
    this.controller.setPriceBucketConfig(
      this.state.devSettings.priceBucketMode,
      this.state.devSettings.priceBucketCount
    );
    const orientation = this.computePivotOrientation();
    this.controller.setPivotOrientation(orientation);
    this.setState({ pivotOrientation: orientation }, () => this.syncPivotUI());

    // Listen to controller state changes
    this.controller.addListener(state => {
      const currentProduct = this.state.selectedProduct;
      const groupKey = currentProduct ? this.controller.getGroupKeyForProduct(currentProduct) : undefined;
      const sequence = groupKey
        ? this.controller.getDisplayOrderForGroup(groupKey).map(p => p.id)
        : this.controller.getDisplayOrder().map(p => p.id);
      this.setState({
        loading: state.loading,
        error: state.error,
        filteredProducts: state.filteredProducts,
        pivotGroups: state.pivotGroups,
        modalSequence: sequence
      }, () => {
        this.syncPivotUI();
        if (this.state.selectedProduct) {
          const idx = sequence.indexOf(this.state.selectedProduct.id);
          if (idx >= 0) {
            const updatedProduct = this.controller.getDisplayOrder().find(p => p.id === sequence[idx])
              ?? this.state.filteredProducts.find(p => p.id === sequence[idx]);
            if (updatedProduct) {
              this.setState({ selectedIndex: idx, selectedProduct: updatedProduct, modalDirection: 0 });
            }
          } else {
            this.setState({ selectedProduct: null, selectedIndex: -1, modalDirection: 0 });
          }
        }
      });
    });

    // Setup event listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('resize', this.handleOrientationChange);
    canvas.addEventListener('click', this.handleCanvasClick);
    canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', this.handleCanvasMouseLeave);
    document.addEventListener('keydown', this.handleKeyDown);

    // Start FPS counter
    this.startFPSCounter();

    // Initial resize
    requestAnimationFrame(() => this.handleResize());
  }

  componentWillUnmount(): void {
    this.controller.destroy();
    this.stopFPSCounter();
    if (this.zoomStabilityTimer) {
      clearTimeout(this.zoomStabilityTimer);
      this.zoomStabilityTimer = null;
    }
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('click', this.handleCanvasClick);
      canvas.removeEventListener('mousemove', this.handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', this.handleCanvasMouseLeave);
    }
    window.removeEventListener('resize', this.handleOrientationChange);
  }

  componentDidUpdate(prevProps: {}, prevState: State): void {
    // Update filter criteria
    if (
      prevState.search !== this.state.search ||
      prevState.category !== this.state.category ||
      prevState.season !== this.state.season ||
      prevState.priceMin !== this.state.priceMin ||
      prevState.priceMax !== this.state.priceMax ||
      prevState.weightMin !== this.state.weightMin ||
      prevState.weightMax !== this.state.weightMax
    ) {
      this.controller.setFilterCriteria({
        search: this.state.search,
        category: this.state.category,
        season: this.state.season,
        priceMin: this.state.priceMin,
        priceMax: this.state.priceMax,
        weightMin: this.state.weightMin,
        weightMax: this.state.weightMax,
      });
    }

    // Update sort mode
    if (prevState.sortMode !== this.state.sortMode) {
      this.controller.setSortMode(this.state.sortMode);
    }

    // Update layout mode
    if (prevState.layoutMode !== this.state.layoutMode) {
      this.controller.setLayoutMode(this.state.layoutMode);
    }

    // Update favorites filter
    if (prevState.showOnlyFavorites !== this.state.showOnlyFavorites) {
      this.controller.setShowOnlyFavorites(this.state.showOnlyFavorites);
    }

    // Update hover state
    if (prevState.hoveredProduct !== this.state.hoveredProduct) {
      this.controller.setHoveredProduct(this.state.hoveredProduct);
    }

    // Update focus state
    if (prevState.focusedIndex !== this.state.focusedIndex) {
      const { filteredProducts, focusedIndex } = this.state;
      const focusedProduct = focusedIndex >= 0 && focusedIndex < filteredProducts.length
        ? filteredProducts[focusedIndex]
        : null;
      this.controller.setFocusedProduct(focusedProduct);
    }

    // Update selected product overlay (Canvas-based rendering)
    if (
      prevState.selectedProduct !== this.state.selectedProduct ||
      prevState.devSettings.heroDisplayMode !== this.state.devSettings.heroDisplayMode ||
      prevState.devSettings.overlayScaleMode !== this.state.devSettings.overlayScaleMode ||
      prevState.overlayMode !== this.state.overlayMode
    ) {
      const renderer = this.controller.getRenderer();
      if (renderer) {
        renderer.heroDisplayMode = this.state.devSettings.heroDisplayMode;
        renderer.overlayScaleMode = this.state.devSettings.overlayScaleMode;

        // Only render in Canvas if overlayMode is 'canvas'
        if (this.state.overlayMode === 'canvas' && this.state.selectedProduct && this.state.devSettings.heroDisplayMode === 'overlay') {
          const node = this.controller.getProductNode(this.state.selectedProduct.id);
          if (node) {
            const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
            const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
            const nodeW = node.width.targetValue ?? node.width.value ?? 0;
            const nodeH = node.height.targetValue ?? node.height.value ?? 0;

            const productCenterX = nodeX + nodeW / 2;
            const productCenterY = nodeY + nodeH / 2;

            renderer.selectedProduct = this.state.selectedProduct;
            renderer.selectedProductAnchor = { x: productCenterX, y: productCenterY };
            // Pass the same node bounds to ensure consistency
            renderer.selectedProductBounds = { x: nodeX, y: nodeY, width: nodeW, height: nodeH };

            // Setting overlay for product
          } else {
            console.warn('[App] Node not found for selected product:', this.state.selectedProduct.id);
          }
        } else {
          renderer.selectedProduct = null;
          renderer.selectedProductAnchor = null;
          renderer.selectedProductBounds = null;
        }
      }
    }

    // Update showReactDialog based on zoom stability
    if (
      prevState.selectedProduct !== this.state.selectedProduct ||
      prevState.zoom !== this.state.zoom ||
      prevState.overlayMode !== this.state.overlayMode
    ) {
      // Clear existing timer
      if (this.zoomStabilityTimer) {
        clearTimeout(this.zoomStabilityTimer);
        this.zoomStabilityTimer = null;
      }

      // If zoom changed, hide dialog immediately and mark as animating
      if (prevState.zoom !== this.state.zoom) {
        this.setState({
          showReactDialog: false,
          isZoomAnimating: true
        });

        // Wait for zoom to stabilize (200ms)
        this.zoomStabilityTimer = window.setTimeout(() => {
          this.zoomStabilityTimer = null;
          const shouldShow = this.state.overlayMode === 'react' &&
                           this.state.selectedProduct !== null &&
                           this.state.zoom > 1.5;

          this.setState({
            isZoomAnimating: false,
            showReactDialog: shouldShow
          });
        }, 200);
      } else {
        // Product or overlay mode changed, update immediately
        const shouldShow = this.state.overlayMode === 'react' &&
                         this.state.selectedProduct !== null &&
                         this.state.zoom > 1.5 &&
                         !this.state.isZoomAnimating;

        if (shouldShow !== this.state.showReactDialog) {
          this.setState({ showReactDialog: shouldShow });
        }
      }
    }
  }

  private handleResize = () => {
    this.controller.handleResize();
  };
  
  private handleOrientationChange = () => {
    const orientation = this.computePivotOrientation();
    if (orientation !== this.state.pivotOrientation) {
      this.controller.setPivotOrientation(orientation);
      this.setState({ pivotOrientation: orientation });
    }
  };
  
  private computePivotOrientation(): Orientation {
    const { innerWidth, innerHeight } = window;
    return innerWidth >= innerHeight ? 'columns' : 'rows';
  }
  
  private syncPivotUI = () => {
    const currentDim = this.controller.getPivotDimension();
    const availableDims = this.controller.getAvailablePivotDimensions();
    const definitions = this.controller.getPivotDimensionDefinitions();
    const preferredOrder = definitions.map(def => def.key);
    // Keep a stable order based on analyzer definitions. Do not reorder chips dynamically.
    const dims: GroupDimension[] = [...preferredOrder];
    const sequence = this.controller.getDisplayOrder().map(p => p.id);
    this.setState({
      pivotBreadcrumbs: this.controller.getPivotBreadcrumbs(),
      pivotDimension: currentDim,
      pivotDimensions: dims,
      pivotDefinitions: definitions,
      pivotOrientation: this.controller.getPivotOrientation(),
      pivotGroups: this.controller.getPivotGroups(),
      modalSequence: sequence,
      isPivotHeroMode: this.controller.isPivotHeroMode()
    });
  };

  private startFPSCounter = () => {
    this.fpsLastSample = performance.now();
    this.fpsFrameCount = 0;
    const tick = (now: number) => {
      this.fpsFrameCount += 1;
      if (now - this.fpsLastSample >= 500) {
        const elapsed = now - this.fpsLastSample;
        const fps = (this.fpsFrameCount * 1000) / elapsed;
        const zoom = this.controller.getZoom();

        // Only update zoom if it changed significantly (avoid dialog flicker from floating point changes)
        if (Math.abs(zoom - this.state.zoom) > 0.01) {
          this.setState({ fps, zoom });
        } else {
          this.setState({ fps });
        }

        this.fpsFrameCount = 0;
        this.fpsLastSample = now;
      }
      this.fpsRaf = requestAnimationFrame(tick);
    };
    this.fpsRaf = requestAnimationFrame(tick);
  };

  private stopFPSCounter = () => {
    if (this.fpsRaf !== null) {
      cancelAnimationFrame(this.fpsRaf);
      this.fpsRaf = null;
    }
  };

  private handleDevSettingsChange = (newSettings: DeveloperSettings) => {
    this.setState({ devSettings: newSettings });
    // Apply settings to controller/layout
    this.controller.updateGridConfig(newSettings.gridConfig);
    this.controller.setAnimationDuration(newSettings.animationDuration);
    this.controller.setPriceBucketConfig(newSettings.priceBucketMode, newSettings.priceBucketCount);
    const orientation = this.computePivotOrientation();
    this.controller.setPivotOrientation(orientation);
  };

  private handleBreadcrumbClick = (index: number) => {
    const { pivotBreadcrumbs } = this.state;
    if (index < 0 || index >= pivotBreadcrumbs.length) return;
    if (index === pivotBreadcrumbs.length - 1) return; // current level
    if (index === 0) {
      this.controller.resetPivot();
      const defaultDim = this.controller.getPivotDimensionDefinitions()[0]?.key;
      if (defaultDim) {
        this.controller.setPivotDimension(defaultDim);
      }
    } else {
      const levelsToRemove = pivotBreadcrumbs.length - 1 - index;
      for (let i = 0; i < levelsToRemove; i++) {
        this.controller.drillUpPivot();
      }
    }
    this.syncPivotUI();
  };

  private handleDimensionClick = (dimension: GroupDimension) => {
    if (dimension === this.state.pivotDimension) return;
    this.controller.setPivotDimension(dimension);
    this.syncPivotUI();
  };

  private handleGroupSelect = (groupKey: string) => {
    this.controller.drillDownGroup(groupKey);
    this.syncPivotUI();
  };

  private showRelativeProduct = (delta: number) => {
    const { filteredProducts, selectedIndex, modalSequence } = this.state;
    if (selectedIndex < 0 || modalSequence.length === 0) return;
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= modalSequence.length) return;
    const nextId = modalSequence[nextIndex];
    const nextProduct = filteredProducts.find(p => p.id === nextId) || this.controller.getDisplayOrder().find(p => p.id === nextId);
    if (!nextProduct) return;
    this.setState({ selectedProduct: nextProduct, selectedIndex: nextIndex, modalDirection: Math.sign(delta) });
  };

  private handleCanvasClick = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for overlay clicks first (if overlay is visible and in canvas mode)
    if (this.state.overlayMode === 'canvas' && this.state.selectedProduct && this.state.devSettings.heroDisplayMode === 'overlay') {
      const renderer = this.controller.getRenderer();
      const overlayClick = renderer?.checkOverlayClick(x, y);

      if (overlayClick === 'close') {
        // Close the overlay
        this.setState({ selectedProduct: null });
        return;
      } else if (overlayClick === 'view') {
        // Open product on O'Neal website
        const product = this.state.selectedProduct;

        // Use product_url from meta if available (direct link from API)
        const productUrl = product.meta?.product_url;

        if (productUrl && typeof productUrl === 'string') {
          window.open(productUrl, '_blank');
          // Opening product on website
        } else {
          // Fallback: construct URL from SKU or ID
          const identifier = product.sku || product.id;
          const url = `https://www.oneal.eu/de-de/product/${encodeURIComponent(identifier)}`;
          window.open(url, '_blank');
          // Opening product on website (fallback)
        }
        return;
      } else if (overlayClick === 'cart') {
        // Handle add to cart button
        // Add to Cart clicked
        // TODO: Implement add to cart
        return;
      } else if (overlayClick === 'background') {
        // Clicked on overlay background - consume the click (do nothing)
        return;
      }
      // If overlayClick is null, continue with normal click handling
    }

    // Check for group header click (in pivot mode)
    const groupHeaderClicked = this.controller.handleGroupHeaderClick(x, y);
    if (groupHeaderClicked) {
      this.syncPivotUI();
      return;
    }

    // Otherwise check for product click
    const product = this.controller.hitTest(x, y);
    if (product) {
      // Product clicked

      // Center the clicked product smoothly (if zoomed in)
      // Rubberband system will automatically prevent bounds violations
      this.controller.centerOnProduct(product);

      // Set selected product to show annotations (in Hero Mode)
      this.setState({ selectedProduct: product });

      // TODO: Modal dialog deaktiviert - User möchte kein Modal
      // const groupKey = this.controller.getGroupKeyForProduct(product);
      // const sequence = this.controller.getDisplayOrderForGroup(groupKey).map(p => p.id);
      // const idx = sequence.indexOf(product.id);
      // this.setState({ selectedProduct: product, selectedIndex: idx, modalDirection: 0, modalSequence: sequence });
    } else {
      // Clicked on empty space - deselect product
      this.setState({ selectedProduct: null });
    }
  };

  private handleCanvasMouseMove = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const product = this.controller.hitTest(x, y);
    
    if (product !== this.state.hoveredProduct) {
      this.setState({
        hoveredProduct: product,
        mousePos: product ? { x: e.clientX, y: e.clientY } : null
      });
      canvas.style.cursor = product ? 'pointer' : 'default';
    } else if (product) {
      this.setState({ mousePos: { x: e.clientX, y: e.clientY } });
    }
  };

  private handleCanvasMouseLeave = () => {
    const canvas = this.canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
    this.setState({ hoveredProduct: null, mousePos: null });
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Don't handle if modal is open or typing in input
    if (this.state.selectedProduct || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
      return;
    }

    const { filteredProducts, focusedIndex } = this.state;
    if (filteredProducts.length === 0) return;

    let newIndex = focusedIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, filteredProducts.length - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = focusedIndex < 0 ? 0 : Math.max(focusedIndex - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = filteredProducts.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredProducts.length) {
          const product = filteredProducts[focusedIndex];
          const groupKey = this.controller.getGroupKeyForProduct(product);
          const sequence = this.controller.getDisplayOrderForGroup(groupKey).map(p => p.id);
          const seqIndex = sequence.indexOf(product.id);
          this.setState({ selectedProduct: product, selectedIndex: seqIndex, modalDirection: 0, modalSequence: sequence });
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      this.setState({ focusedIndex: newIndex });
    }
  };

  render() {
    const { loading, error, selectedProduct, hoveredProduct, mousePos } = this.state;
    const {
      search,
      category,
      season,
      priceMin,
      priceMax,
      weightMin,
      weightMax,
      sortMode,
      layoutMode,
      showOnlyFavorites,
      showFilters,
      pivotDimension,
      pivotBreadcrumbs,
      pivotDimensions,
      pivotDefinitions,
      isPivotHeroMode
    } = this.state;

    // Compute availability live but keep chip order stable
    const availableDimsNow = this.controller.getAvailablePivotDimensions();

    const cats = this.controller.getUniqueCategories();
    const seasons = this.controller.getUniqueSeasons();

    const getDimensionLabel = (dim: GroupDimension) => pivotDefinitions.find(d => d.key === dim)?.label ?? dim;

    if (error) return <div className="container"><div className="error">{error}</div></div>;

    return (
      <div className="pf-root">
        {/* Primary toolbar intentionally hidden to maximize canvas area. Developer overlay remains accessible via F1. */}
        <div className="pf-stage">
          <canvas ref={this.canvasRef} className="pf-canvas" />

          {/* Force labels overlay (only for force-labels mode) - rendered as HTML */}
          {isPivotHeroMode && selectedProduct && this.state.devSettings.heroDisplayMode === 'force-labels' && this.canvasRef.current && (() => {
            const canvas = this.canvasRef.current!;
            const node = this.controller.getProductNode(selectedProduct.id);
            if (!node) return null;

            const viewport = this.controller.getViewportTransform();
            if (!viewport) return null;

            const productCenterX = (node.posX.targetValue ?? node.posX.value ?? 0) + (node.width.targetValue ?? node.width.value ?? 0) / 2;
            const productCenterY = (node.posY.targetValue ?? node.posY.value ?? 0) + (node.height.targetValue ?? node.height.value ?? 0) / 2;

            return (
              <ProductAnnotations
                product={selectedProduct}
                anchorX={productCenterX}
                anchorY={productCenterY}
                canvasWidth={canvas.width}
                canvasHeight={canvas.height}
                viewportScale={viewport.getTargetScale()}
                viewportOffsetX={viewport.getTargetOffset().x}
                viewportOffsetY={viewport.getTargetOffset().y}
                forceConfig={this.state.devSettings.forceLabelsConfig}
              />
            );
          })()}
        </div>

        <div className={`pf-bottom-bar ${this.state.mobileFooterExpanded ? 'expanded' : 'collapsed'}`}>
          {/* Desktop: PATH section (always visible) */}
          <div className="pf-bottom-section pf-bottom-left pf-bottom-desktop-section">
            <span className="pf-bottom-label">Path</span>
            <div className="pf-bottom-crumbs">
              {pivotBreadcrumbs.map((crumb, i) => (
                <React.Fragment key={`${crumb}-${i}`}>
                  {i > 0 && <span className="pf-pivot-sep">›</span>}
                  <span
                    role="button"
                    tabIndex={i === pivotBreadcrumbs.length - 1 ? -1 : 0}
                    className={`pf-bottom-crumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => this.handleBreadcrumbClick(i)}
                    onKeyDown={evt => {
                      if (evt.key === 'Enter' || evt.key === ' ') {
                        evt.preventDefault();
                        this.handleBreadcrumbClick(i);
                      }
                    }}
                  >
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Desktop: DIMENSIONS section (always visible) */}
          <div className="pf-bottom-section pf-bottom-center pf-bottom-desktop-section">
            <span className="pf-bottom-label">Dimensions</span>
            <div className="pf-bottom-dimensions">
              {layoutMode === 'pivot' ? (
                <div className="pf-bottom-dimension-row">
                  {pivotDimensions.map(dim => (
                    <button
                      type="button"
                      key={dim}
                      className={`pf-pivot-chip ${dim === pivotDimension ? 'active' : ''}`}
                      onClick={() => this.handleDimensionClick(dim)}
                      disabled={dim === pivotDimension || !availableDimsNow.includes(dim)}
                      aria-current={dim === pivotDimension}
                      aria-disabled={!availableDimsNow.includes(dim)}
                    >
                      {getDimensionLabel(dim)}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="pf-bottom-placeholder">Dimensions available in Pivot layout</span>
              )}
            </div>
          </div>

          {/* Desktop: SORT section (always visible) */}
          <div className="pf-bottom-section pf-bottom-right pf-bottom-desktop-section">
            <label className="pf-bottom-label" htmlFor="pf-bottom-sort">Sort</label>
            <CustomSelect
              value={sortMode}
              onChange={(value) => this.setState({ sortMode: value as SortMode })}
              options={[
                { value: 'none', label: 'None' },
                { value: 'name-asc', label: 'Name (A-Z)' },
                { value: 'name-desc', label: 'Name (Z-A)' },
                { value: 'price-asc', label: 'Price (Low-High)' },
                { value: 'price-desc', label: 'Price (High-Low)' },
                { value: 'weight-asc', label: 'Weight (Light-Heavy)' },
                { value: 'weight-desc', label: 'Weight (Heavy-Light)' },
                { value: 'season-desc', label: 'Season (Newest)' },
              ]}
            />
          </div>

          {/* Mobile: Collapsed summary view */}
          {!this.state.mobileFooterExpanded && (
            <div className="pf-bottom-bar-collapsed">
              <div className="pf-bottom-collapsed-content">
                <div className="pf-bottom-collapsed-row">
                  <span className="pf-bottom-label">DIMENSIONS</span>
                </div>
                <div className="pf-bottom-collapsed-row">
                  <span className="pf-bottom-summary-text">
                    {getDimensionLabel(pivotDimension)}: {pivotBreadcrumbs[pivotBreadcrumbs.length - 1]}
                  </span>
                </div>
                {sortMode !== 'none' && (
                  <div className="pf-bottom-collapsed-row">
                    <span className="pf-bottom-summary-text">
                      Sort: {sortMode}
                    </span>
                  </div>
                )}
              </div>
              <button
                className="pf-bottom-toggle-btn"
                onClick={() => this.setState({ mobileFooterExpanded: true })}
                aria-label="Expand filters"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
            </div>
          )}

          {/* Mobile: Expanded view with all filters */}
          {this.state.mobileFooterExpanded && (
            <>
              <div className="pf-bottom-bar-mobile-top">
                <span className="pf-bottom-label">DIMENSIONS</span>
                <button
                  className="pf-bottom-toggle-btn"
                  onClick={() => this.setState({ mobileFooterExpanded: false })}
                  aria-label="Collapse filters"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>

              <div className="pf-bottom-section pf-bottom-right pf-bottom-mobile-section">
                <label className="pf-bottom-label" htmlFor="pf-bottom-sort-mobile">SORT</label>
                <CustomSelect
                  value={sortMode}
                  onChange={(value) => this.setState({ sortMode: value as SortMode })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'name-asc', label: 'Name (A-Z)' },
                    { value: 'name-desc', label: 'Name (Z-A)' },
                    { value: 'price-asc', label: 'Price (Low-High)' },
                    { value: 'price-desc', label: 'Price (High-Low)' },
                    { value: 'weight-asc', label: 'Weight (Light-Heavy)' },
                    { value: 'weight-desc', label: 'Weight (Heavy-Light)' },
                    { value: 'season-desc', label: 'Season (Newest)' },
                  ]}
                />
              </div>

              <div className="pf-bottom-section pf-bottom-center pf-bottom-mobile-section">
                <div className="pf-bottom-dimensions">
                  {layoutMode === 'pivot' ? (
                    <div className="pf-bottom-dimension-row">
                      {pivotDimensions.map(dim => (
                        <button
                          type="button"
                          key={dim}
                          className={`pf-pivot-chip ${dim === pivotDimension ? 'active' : ''}`}
                          onClick={() => this.handleDimensionClick(dim)}
                          disabled={dim === pivotDimension || !availableDimsNow.includes(dim)}
                          aria-current={dim === pivotDimension}
                          aria-disabled={!availableDimsNow.includes(dim)}
                        >
                          {getDimensionLabel(dim)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="pf-bottom-placeholder">Dimensions available in Pivot layout</span>
                  )}
                </div>
              </div>

              <div className="pf-bottom-section pf-bottom-left pf-bottom-mobile-section">
                <span className="pf-bottom-label">PATH</span>
                <div className="pf-bottom-crumbs">
                  {pivotBreadcrumbs.map((crumb, i) => (
                    <React.Fragment key={`${crumb}-${i}`}>
                      {i > 0 && <span className="pf-pivot-sep">›</span>}
                      <span
                        role="button"
                        tabIndex={i === pivotBreadcrumbs.length - 1 ? -1 : 0}
                        className={`pf-bottom-crumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''}`}
                        onClick={() => this.handleBreadcrumbClick(i)}
                        onKeyDown={evt => {
                          if (evt.key === 'Enter' || evt.key === ' ') {
                            evt.preventDefault();
                            this.handleBreadcrumbClick(i);
                          }
                        }}
                      >
                        {crumb}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* React Product Info Panel (positioned next to product in canvas) */}
        <AnimatePresence>
          {this.state.showReactDialog && selectedProduct && (() => {
            // Show dialog with smooth fadeout
            const node = this.controller.getProductNode(selectedProduct.id);
            if (!node) return null;

            const viewport = this.controller.getViewportTransform();
            if (!viewport) return null;

            const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
            const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
            const nodeW = node.width.targetValue ?? node.width.value ?? 0;
            const nodeH = node.height.targetValue ?? node.height.value ?? 0;

            // Convert world coordinates to screen coordinates
            const screenX = (nodeX * viewport.scale) + viewport.offset.x;
            const screenY = (nodeY * viewport.scale) + viewport.offset.y;
            const screenW = nodeW * viewport.scale;
            const screenH = nodeH * viewport.scale;

            // Position panel to the right of the product
            const panelX = screenX + screenW + 20; // 20px gap
            const panelY = screenY;

            return (
              <ProductOverlayModal
                product={selectedProduct}
                onClose={() => this.setState({ selectedProduct: null })}
                position={{ x: panelX, y: panelY }}
              />
            );
          })()}
        </AnimatePresence>
        
        {hoveredProduct && mousePos && (
          <div 
            className="pf-tooltip"
            style={{
              position: 'fixed',
              left: mousePos.x + 15,
              top: mousePos.y + 15,
            }}
          >
            <div className="pf-tooltip-content">
              <div className="pf-tooltip-name">{hoveredProduct.name}</div>
              {hoveredProduct.price && (
                <div className="pf-tooltip-price">{hoveredProduct.price.formatted}</div>
              )}
              {hoveredProduct.brand && (
                <div className="pf-tooltip-brand">{hoveredProduct.brand}</div>
              )}
              <div className="pf-tooltip-hint">Click for details</div>
            </div>
          </div>
        )}

        <DeveloperOverlay
          settings={this.state.devSettings}
          onSettingsChange={this.handleDevSettingsChange}
          productCount={this.state.filteredProducts.length}
          fps={this.state.fps}
          zoom={this.state.zoom}
        />
      </div>
    );
  }
}
