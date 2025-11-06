import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import ProductModal from './components/ProductModal';
import { ProductAnnotations } from './components/ProductAnnotations';
import { ProductImageAnnotations } from './components/ProductImageAnnotations';
import { ProductOverlay } from './components/ProductOverlay';
import { ProductOverlayModal } from './components/ProductOverlayModal';
import { AnimatePresence } from 'framer-motion';
import { fetchAnnotations } from './services/StorageAnnotationService';
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
import { getImagesForVariant, getPrimaryVariant } from './utils/variantImageHelpers';
import { globalImageQueue } from './utils/GlobalImageQueue';
import { buildMediaUrl } from './utils/MediaUrlBuilder';
import QuickSearchCommandPalette from './components/QuickSearchCommandPalette';
import { AiProductQueryService } from './services/AiProductQueryService';

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
  selectedVariant: any | null; // Currently selected variant for the selected product
  selectedIndex: number;
  modalDirection: number;
  modalSequence: string[];
  hoveredProduct: Product | null;
  mousePos: { x: number; y: number } | null;
  focusedIndex: number;
  mobileFooterExpanded: boolean;

  // Overlay Mode
  overlayMode: 'canvas' | 'react'; // Toggle between canvas and React overlay

  // Developer Settings
  devSettings: DeveloperSettings;
  fps: number;
  zoom: number;

  // Dialog position for connection line
  dialogPosition: { x: number; y: number } | null;

  // AI Quicksearch
  isQuickSearchOpen: boolean;
  quickSearchPrompt: string;
  quickSearchLoading: boolean;
  quickSearchError: string | null;
  aiFilterProductIds: string[];
  aiLastResultCount: number | null;
  quickSearchPosition: { x: number; y: number } | null;
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
    selectedVariant: null,
    selectedIndex: -1,
    modalDirection: 0,
    modalSequence: [],
    hoveredProduct: null,
    mousePos: null,
    focusedIndex: -1,

    overlayMode: 'react', // Default to React overlay

    devSettings: createDefaultDeveloperSettings(),
    fps: 60,
    zoom: 1,
    mobileFooterExpanded: false,
    dialogPosition: null,

    isQuickSearchOpen: false,
    quickSearchPrompt: '',
    quickSearchLoading: false,
    quickSearchError: null,
    aiFilterProductIds: [],
    aiLastResultCount: null,
    quickSearchPosition: null,
  };
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private controller = new ProductFinderController();
  private fpsRaf: number | null = null;
  private fpsLastSample = 0;
  private fpsFrameCount = 0;

  // Use global shared image queue for truly sequential loading
  private imageLoadQueue = globalImageQueue;

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

    // Touch events for mobile
    canvas.addEventListener('touchend', this.handleCanvasTouchEnd);
    canvas.addEventListener('touchmove', this.handleCanvasTouchMove);

    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keydown', this.handleQuickSearchHotkey);

    // Setup browser history management for back button
    window.addEventListener('popstate', this.handlePopState);
    // Push initial state so first back doesn't leave the app
    this.pushHistoryState({ type: 'initial', breadcrumbs: this.state.pivotBreadcrumbs });

    // Start FPS counter
    this.startFPSCounter();

    // Initial resize
    requestAnimationFrame(() => this.handleResize());
  }

  componentWillUnmount(): void {
    this.controller.destroy();
    this.stopFPSCounter();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('popstate', this.handlePopState);
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keydown', this.handleQuickSearchHotkey);
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('click', this.handleCanvasClick);
      canvas.removeEventListener('mousemove', this.handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', this.handleCanvasMouseLeave);
      canvas.removeEventListener('touchend', this.handleCanvasTouchEnd);
      canvas.removeEventListener('touchmove', this.handleCanvasTouchMove);
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

    // Update dialog position for connection line (separate from image loading)
    if (prevState.dialogPosition !== this.state.dialogPosition) {
      const renderer = this.controller.getRenderer();
      if (renderer && this.state.overlayMode === 'react' && this.state.selectedProduct && this.state.dialogPosition) {
        const node = this.controller.getProductNode(this.state.selectedProduct.id);
        if (node) {
          const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
          const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
          const nodeW = node.width.targetValue ?? node.width.value ?? 0;
          const nodeH = node.height.targetValue ?? node.height.value ?? 0;

          const productCenterX = nodeX + nodeW / 2;
          const productCenterY = nodeY + nodeH / 2;

          renderer.dialogConnectionPoint = { x: productCenterX, y: productCenterY };
          renderer.dialogPosition = {
            x: this.state.dialogPosition.x,
            y: this.state.dialogPosition.y + 150 // Approximate middle of dialog
          };
        }
      }
    }

    // Update selected product overlay and load images (only when product/variant changes)
    if (
      prevState.selectedProduct !== this.state.selectedProduct ||
      prevState.selectedVariant !== this.state.selectedVariant ||
      prevState.devSettings.heroDisplayMode !== this.state.devSettings.heroDisplayMode ||
      prevState.devSettings.overlayScaleMode !== this.state.devSettings.overlayScaleMode ||
      prevState.overlayMode !== this.state.overlayMode
    ) {
      const renderer = this.controller.getRenderer();
      if (renderer) {
        renderer.heroDisplayMode = this.state.devSettings.heroDisplayMode;
        renderer.overlayScaleMode = this.state.devSettings.overlayScaleMode;
        renderer.imageSpreadDirection = this.state.devSettings.imageSpreadDirection;

        // Load variant images for stacked display (React mode)
        if (this.state.overlayMode === 'react' && this.state.selectedProduct) {
          // Set selected product so renderer knows which product to draw stacked images for
          renderer.selectedProduct = this.state.selectedProduct;

          // Reset pivot hero LOD tracking when product changes
          (renderer as any).pivotHeroLoadedSize = null;

          // Get node bounds for LOD and connection line
          const node = this.controller.getProductNode(this.state.selectedProduct.id);
          if (node) {
            const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
            const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
            const nodeW = node.width.targetValue ?? node.width.value ?? 0;
            const nodeH = node.height.targetValue ?? node.height.value ?? 0;

            // Set bounds for pivot LOD system
            renderer.selectedProductBounds = { x: nodeX, y: nodeY, width: nodeW, height: nodeH };

            // Update connection line position
            if (this.state.dialogPosition) {
              const productCenterX = nodeX + nodeW / 2;
              const productCenterY = nodeY + nodeH / 2;

              renderer.dialogConnectionPoint = { x: productCenterX, y: productCenterY };
              renderer.dialogPosition = {
                x: this.state.dialogPosition.x,
                y: this.state.dialogPosition.y + 150
              };
            }
          }

          // Collect alternative images for stacked display
          // Only load images for the currently selected variant
          const product = this.state.selectedProduct as any;
          const alternativeImages: Array<{
            storageId: number;
            src: string;
            loadedImage?: HTMLImageElement;
            orientation?: 'portrait' | 'landscape';
          }> = [];

          // Get the current variant (or primary variant if none selected)
          const currentVariant = this.state.selectedVariant || getPrimaryVariant(product);

            if (currentVariant) {
              // Get all images for this variant (hero + gallery)
              const variantImages = getImagesForVariant(product, currentVariant);

              // Hero image is now loaded automatically by LOD system in CanvasRenderer
              // No need to load it here - LOD will handle upgrading from low-res to high-res

              // Cancel any pending image loads from previous product
              const productGroup = `product-${this.state.selectedProduct.id}`;
              this.imageLoadQueue.cancelGroup(productGroup);

              // Load alternative images for spread animation (skip first image as it's the hero image)
              // Queue handles parallel/sequential loading and prevents browser connection limit issues
              for (let i = 1; i < variantImages.length; i++) {
                const variantImg = variantImages[i];
                const storageId = variantImg.storageId;

                // Use high-res images (1300px @ 85% quality) - same as LOD system
                const src = buildMediaUrl({
                  storageId,
                  width: 1300,
                  height: 1300,
                  quality: 85,
                });
                const imgObj: any = { storageId, src };

                // Add to load queue
                this.imageLoadQueue.add({
                  id: `${productGroup}-img-${i}`,
                  url: src,
                  group: productGroup,
                  priority: 100 + i, // Alternative images: priority 100+ (after thumbnails, before LOD)
                  metadata: { storageId, index: i }
                }).then(result => {
                  // Image loaded successfully
                  imgObj.loadedImage = result.image;
                  imgObj.orientation = result.image.height > result.image.width ? 'portrait' : 'landscape';
                }).catch(error => {
                  // Only log real errors, not cancelled requests (expected when switching products)
                  if (error.error?.message !== 'Request cancelled' && error.error?.message !== 'Request no longer relevant') {
                    console.warn('[App] Failed to load alternative image:', storageId, error.error);
                  }
                });

                alternativeImages.push(imgObj);
              }
            } else {
              renderer.selectedVariantHeroImage = null;
            }

          renderer.alternativeImages = alternativeImages.length > 0 ? alternativeImages : null;
        } else {
          // No selected product - clear images
          renderer.alternativeImages = null;
          renderer.selectedVariantHeroImage = null;
          renderer.dialogConnectionPoint = null;
          renderer.dialogPosition = null;
        }

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
        } else if (this.state.overlayMode !== 'react') {
          // Only clear if not in React mode (React mode sets selectedProduct for stacked images)
          renderer.selectedProduct = null;
          renderer.selectedProductAnchor = null;
          renderer.selectedProductBounds = null;
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

    // Close dialog immediately on pivot navigation
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null });

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

    // Close dialog immediately on dimension change
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null });

    this.controller.setPivotDimension(dimension);
    this.syncPivotUI();
  };

  private handleGroupSelect = (groupKey: string) => {
    // Close dialog immediately on group drill down
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null });

    this.controller.drillDownGroup(groupKey);
    this.syncPivotUI();

    // Push history state for back button navigation
    this.pushHistoryState({ type: 'drillDown', groupKey, breadcrumbs: this.state.pivotBreadcrumbs });
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
        this.setState({ selectedProduct: null, selectedVariant: null });
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
      // Also set the primary variant
      const primaryVariant = getPrimaryVariant(product);
      this.setState({ selectedProduct: product, selectedVariant: primaryVariant });

      // Load AI annotations for the hero image
      const storageId = this.getProductStorageId(product);
      if (storageId) {
        fetchAnnotations(storageId).then((annotations) => {
          const renderer = this.controller.getRenderer();
          if (renderer) {
            renderer.heroImageAnnotations = annotations;
            // Rendering happens automatically in the animation loop
          }
        });
      } else {
        const renderer = this.controller.getRenderer();
        if (renderer) {
          renderer.heroImageAnnotations = null;
        }
      }

      // Push history state for back button navigation
      this.pushHistoryState({ type: 'productSelect', productId: product.id });

      // TODO: Modal dialog deaktiviert - User möchte kein Modal
      // const groupKey = this.controller.getGroupKeyForProduct(product);
      // const sequence = this.controller.getDisplayOrderForGroup(groupKey).map(p => p.id);
      // const idx = sequence.indexOf(product.id);
      // this.setState({ selectedProduct: product, selectedIndex: idx, modalDirection: 0, modalSequence: sequence });
    } else {
      // Clicked on empty space - deselect product
      this.setState({ selectedProduct: null, selectedVariant: null });
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

  private handleCanvasTouchEnd = (e: TouchEvent) => {
    e.preventDefault(); // Prevent default touch behavior (scroll, zoom, etc.)

    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Use the first touch point
    const touch = e.changedTouches[0];
    if (!touch) return;

    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Check for overlay clicks first (if overlay is visible and in canvas mode)
    if (this.state.overlayMode === 'canvas' && this.state.selectedProduct && this.state.devSettings.heroDisplayMode === 'overlay') {
      const renderer = this.controller.getRenderer();
      const overlayClick = renderer?.checkOverlayClick(x, y);

      if (overlayClick === 'close') {
        this.setState({ selectedProduct: null, selectedVariant: null });
        return;
      } else if (overlayClick === 'view') {
        const product = this.state.selectedProduct;
        const productUrl = product.meta?.product_url;
        if (productUrl && typeof productUrl === 'string') {
          window.open(productUrl, '_blank');
        } else {
          const identifier = product.sku || product.id;
          const url = `https://www.oneal.eu/de-de/product/${encodeURIComponent(identifier)}`;
          window.open(url, '_blank');
        }
        return;
      } else if (overlayClick === 'cart') {
        return;
      } else if (overlayClick === 'background') {
        return;
      }
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
      this.controller.centerOnProduct(product);
      const primaryVariant = getPrimaryVariant(product);
      this.setState({ selectedProduct: product, selectedVariant: primaryVariant });
    } else {
      this.setState({ selectedProduct: null, selectedVariant: null });
    }
  };

  private handleCanvasTouchMove = (e: TouchEvent) => {
    // Don't prevent default here - allow scrolling when not over a product
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const touch = e.touches[0];
    if (!touch) return;

    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const product = this.controller.hitTest(x, y);

    if (product !== this.state.hoveredProduct) {
      this.setState({
        hoveredProduct: product,
        mousePos: product ? { x: touch.clientX, y: touch.clientY } : null
      });
    }
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

  private handleQuickSearchHotkey = (event: KeyboardEvent) => {
    if (event.key === 'F3') {
      event.preventDefault();
    this.setState(prev => {
      const nextOpen = !prev.isQuickSearchOpen;
      let nextPosition = prev.quickSearchPosition;
      if (nextOpen && !nextPosition && typeof window !== 'undefined') {
        nextPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }
      return {
        isQuickSearchOpen: nextOpen,
        quickSearchError: null,
        quickSearchPosition: nextPosition,
      };
    });
    }

    if (event.key === 'Escape' && this.state.isQuickSearchOpen) {
      event.preventDefault();
      this.closeQuickSearch();
    }
  };

  private handleQuickSearchPromptChange = (value: string) => {
    this.setState({ quickSearchPrompt: value });
  };

  private closeQuickSearch = () => {
    if (this.state.quickSearchLoading) return;
    this.setState({ isQuickSearchOpen: false, quickSearchError: null });
  };

  private clearAiFilter = () => {
    this.controller.clearAiFilterProductIds();
    this.setState({ aiFilterProductIds: [], aiLastResultCount: null });
  };

  private handleQuickSearchAutoPosition = (position: { x: number; y: number }) => {
    this.setState({ quickSearchPosition: position });
  };

  private handleQuickSearchDrag = (position: { x: number; y: number }) => {
    this.setState({ quickSearchPosition: position });
  };

  private handleQuickSearchSubmit = async () => {
    if (this.state.quickSearchLoading) return;
    const query = this.state.quickSearchPrompt.trim();
    if (!query) {
      this.setState({ quickSearchError: 'Bitte gib eine Suchbeschreibung ein.' });
      return;
    }

    this.setState({ quickSearchLoading: true, quickSearchError: null });

    try {
      const { productIds } = await AiProductQueryService.queryProducts(query);
      if (!productIds.length) {
        this.setState({
          quickSearchLoading: false,
          quickSearchError: 'Keine passenden Produkte gefunden. Bitte prompt präzisieren.',
        });
        return;
      }
      this.controller.setAiFilterProductIds(productIds);
      const matchedProducts = this.controller.getFilteredProducts();
      const matchedIds = matchedProducts.map(p => p.id);
      if (!matchedIds.length) {
        this.setState({
          quickSearchLoading: false,
          quickSearchError: 'Die KI hat IDs geliefert, aber sie passen nicht zu geladenen Produkten.',
        });
        return;
      }
      this.setState({
        quickSearchLoading: false,
        isQuickSearchOpen: false,
        quickSearchPrompt: '',
        aiFilterProductIds: matchedIds,
        aiLastResultCount: matchedIds.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die KI-Suche ist fehlgeschlagen.';
      this.setState({ quickSearchLoading: false, quickSearchError: message });
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
      isPivotHeroMode,
      isQuickSearchOpen,
      quickSearchPrompt,
      quickSearchLoading,
      quickSearchError,
      aiFilterProductIds,
      aiLastResultCount,
    } = this.state;

    // Compute availability live but keep chip order stable
    const availableDimsNow = this.controller.getAvailablePivotDimensions();

    const cats = this.controller.getUniqueCategories();
    const seasons = this.controller.getUniqueSeasons();

    const getDimensionLabel = (dim: GroupDimension) => pivotDefinitions.find(d => d.key === dim)?.label ?? dim;

    if (error) return <div className="container"><div className="error">{error}</div></div>;

    return (
      <div className="pf-root">
        <QuickSearchCommandPalette
          isOpen={isQuickSearchOpen}
          prompt={quickSearchPrompt}
          onPromptChange={this.handleQuickSearchPromptChange}
          onSubmit={this.handleQuickSearchSubmit}
          onClose={this.closeQuickSearch}
          isLoading={quickSearchLoading}
          errorMessage={quickSearchError}
          lastResultCount={aiLastResultCount}
        position={this.state.quickSearchPosition ?? undefined}
        onAutoPosition={this.handleQuickSearchAutoPosition}
        onDrag={this.handleQuickSearchDrag}
        />
        {aiFilterProductIds.length > 0 && (
          <div className="quicksearch-indicator">
            <span>KI-Filter aktiv ({aiFilterProductIds.length})</span>
            <button type="button" onClick={this.clearAiFilter}>Zurücksetzen</button>
          </div>
        )}
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
              onChange={(value) => this.setState({ sortMode: value as SortMode, selectedProduct: null, selectedVariant: null, dialogPosition: null })}
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
                  onChange={(value) => this.setState({ sortMode: value as SortMode, selectedProduct: null, selectedVariant: null, dialogPosition: null })}
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

        {/* React Product Info Panel (fixed right side) */}
        <AnimatePresence>
          {this.state.overlayMode === 'react' && selectedProduct && (
            <ProductOverlayModal
              product={selectedProduct}
              onClose={() => this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null })}
              onPositionChange={(pos) => this.setState({ dialogPosition: pos })}
              onVariantChange={(variant) => this.setState({ selectedVariant: variant })}
            />
          )}
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

  /**
   * Push a new history state for back button navigation
   */
  private pushHistoryState(state: { type: string; [key: string]: any }) {
    history.pushState(state, '', window.location.href);
  }

  /**
   * Get storage ID from product media
   */
  private getProductStorageId(product: Product): number | null {
    const media = product.media || [];
    const heroMedia = media.find((m) => m.type === 'hero') || media[0];
    return (heroMedia as any)?.storage_id || null;
  }

  /**
   * Handle browser back button
   */
  private handlePopState = (event: PopStateEvent) => {
    const state = event.state;

    if (!state || state.type === 'initial') {
      // First back - do nothing (stay in app)
      // Re-push initial state so user can't navigate away
      this.pushHistoryState({ type: 'initial', breadcrumbs: this.state.pivotBreadcrumbs });
      return;
    }

    if (state.type === 'productSelect') {
      // User navigated back from product selection - close product
      this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null });
    } else if (state.type === 'drillDown') {
      // User navigated back from drill down - go back one breadcrumb level
      const { pivotBreadcrumbs } = this.state;
      if (pivotBreadcrumbs.length > 1) {
        this.handleBreadcrumbClick(pivotBreadcrumbs.length - 2);
      }
    }
  };
}
