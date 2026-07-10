import React, { lazy, Suspense } from 'react';
import './App.css';
import { CartView } from './components/cart/CartView';
import { SlidePanel, SlidePanelBackdrop } from './components/cart/SlidePanel';
import './components/cart/CartView.css';
import type { CartItem as CartViewItem, ProductSearchResult } from './components/cart/types';

// Lazy-load Arcturian renderer (only when ?renderer=arcturian)
const ArcturianRendererComponent = lazy(() =>
  import('./render/ArcturianRenderer').then(m => ({ default: m.ArcturianRendererComponent }))
);
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import ProductModal from './components/ProductModal';
import { ProductAnnotations } from './components/ProductAnnotations';
import { ProductImageAnnotations } from './components/ProductImageAnnotations';
import { ProductOverlay } from './components/ProductOverlay';
import { ProductOverlayModalV2 as ProductOverlayModal } from './components/ProductOverlayModalV2';
import { ProductOverlayModalV4 } from './components/ProductOverlayModalV4';
import { HeroVideoBackground } from './components/HeroVideoBackground';
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
import { getImagesForVariant, getPrimaryVariant, getUniqueColorVariants } from './utils/variantImageHelpers';
import { globalImageQueue } from './utils/GlobalImageQueue';
import { buildMediaUrl } from './utils/MediaUrlBuilder';
import QuickSearchCommandPalette from './components/QuickSearchCommandPalette';
import { AiProductQueryService } from './services/AiProductQueryService';
import { categoryMediaService } from './services/CategoryMediaService';
import { FOOTER_CONFIG, type FooterPosition } from './config/FooterConfig';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type CartItem = {
  id: string;
  productId: string;
  variantKey: string;
  name: string;
  variantLabel?: string;
  priceText?: string;
  imageUrl?: string;
  quantity: number;
  // For new tabular cart view
  articleNumber?: string;
  color?: string;
  availableColors?: string[];
  availableSizes?: string[];
  sizes?: Record<string, number>;
};

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
  mobilePivotOpen: boolean;

  // Overlay Mode
  overlayMode: 'canvas' | 'react'; // Toggle between canvas and React overlay

  // Developer Settings
  devSettings: DeveloperSettings;
  fps: number;
  productLimit: number;
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

  // AI Prompt (Footer)
  aiPrompt: string;
  aiPromptLoading: boolean;
  aiPromptError: string | null;

  // AI Search History
  aiSearchHistory: Array<{ query: string; productIds: string[]; resultCount: number }>;

  // Footer position
  footerPosition: FooterPosition;
  footerFloatingPosition: { x: number; y: number } | null;

  // V4 Dialog trigger (zoom-based, not hero-mode-based)
  shouldShowV4Dialog: boolean;

  // Hero product trim bounds (for text positioning)
  heroProductTrimBounds: { x: number; y: number; width: number; height: number } | null;
  heroProductPolygon: { x: number; y: number }[] | null;

  // Footer helpers
  footerSearchTerm: string;
  searchFilterTerm: string | null;
  cartItems: CartItem[];
  cartPanelOpen: boolean;
  cartFullOverlay: boolean;
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
    mobilePivotOpen: false,

    overlayMode: 'react', // Default to React overlay

    devSettings: createDefaultDeveloperSettings(),
    fps: 60,
    productLimit: 5000,
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

    aiPrompt: '',
    aiPromptLoading: false,
    aiPromptError: null,
    aiSearchHistory: [],

    footerPosition: FOOTER_CONFIG.position,
    footerFloatingPosition: null,

    shouldShowV4Dialog: false,

    heroProductTrimBounds: null,
    heroProductPolygon: null,

    footerSearchTerm: '',
    searchFilterTerm: null,
    cartItems: [],
    cartPanelOpen: false,
    cartFullOverlay: false,
  };
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private footerRef = React.createRef<HTMLDivElement>();
  private controller = new ProductFinderController();
  private fpsRaf: number | null = null;
  private fpsLastSample = 0;
  private fpsFrameCount = 0;

  // Use global shared image queue for truly sequential loading
  private imageLoadQueue = globalImageQueue;
  private _productAtlasIndex = new Map<string, number>();

  private useArcturianRenderer(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('renderer') === 'arcturian';
  }

  private getProductAtlasIndex(): Map<string, number> {
    return this._productAtlasIndex;
  }

  state: State = createInitialState();

  async componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Load category media in parallel with controller initialization
    const mediaPromise = categoryMediaService.load().catch(err => {
      console.warn('[App] Failed to load category media, continuing without hero images:', err);
    });

    // Configure controller BEFORE initialize (avoids multiple layout re-triggers)
    this.controller.skipCanvasRenderer = this.useArcturianRenderer();
    this.controller.preConfig = {
      gridConfig: this.state.devSettings.gridConfig,
      animationDuration: this.state.devSettings.animationDuration,
      priceBucketMode: this.state.devSettings.priceBucketMode,
      priceBucketCount: this.state.devSettings.priceBucketCount,
      minCellSize: this.useArcturianRenderer() ? 0 : this.state.devSettings.minCellSize,
      cellSizeOverride: this.state.devSettings.cellSizeOverride,
      orientation: this.computePivotOrientation(),
    };
    await this.controller.initialize(canvas);
    await mediaPromise;
    this.setState({ pivotOrientation: this.controller.preConfig.orientation ?? this.state.pivotOrientation }, () => this.syncPivotUI());

    // Listen to controller state changes
    this.controller.addListener(state => {
      const currentProduct = this.state.selectedProduct;
      const groupKey = currentProduct ? this.controller.getGroupKeyForProduct(currentProduct) : undefined;
      const sequence = groupKey
        ? this.controller.getDisplayOrderForGroup(groupKey).map(p => p.id)
        : this.controller.getDisplayOrder().map(p => p.id);
      // Update atlas index for Arcturian renderer
      if (this.useArcturianRenderer()) {
        this._productAtlasIndex.clear();
        state.filteredProducts.forEach((p, i) => this._productAtlasIndex.set(p.id, i));
      }

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
    canvas.addEventListener('touchmove', this.handleCanvasTouchMove, { passive: true }); // Passive for better scroll performance

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
      canvas.removeEventListener('touchmove', this.handleCanvasTouchMove, { passive: true } as any);
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

          // Update connection line (but NOT in Hero Mode with video)
          if (!this.state.isPivotHeroMode) {
            renderer.dialogConnectionPoint = { x: productCenterX, y: productCenterY };
            renderer.dialogPosition = {
              x: this.state.dialogPosition.x,
              y: this.state.dialogPosition.y + 150 // Approximate middle of dialog
            };
          } else {
            // Clear connection line in Hero Mode
            renderer.dialogConnectionPoint = null;
            renderer.dialogPosition = null;
          }
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
        renderer.rectMode = this.state.devSettings.rectMode;

        // Load variant images for stacked display (React mode)
        if (this.state.overlayMode === 'react' && this.state.selectedProduct) {
          // Set selected product so renderer knows which product to draw stacked images for
          renderer.selectedProduct = this.state.selectedProduct;

          // Reset pivot hero LOD tracking when product changes
          (renderer as any).pivotHeroLoadedSize = null;

          // Reset trim bounds when product changes
          if (prevState.selectedProduct !== this.state.selectedProduct) {
            renderer.heroProductTrimBounds = null;
          }

          // Get node bounds for LOD and connection line
          const node = this.controller.getProductNode(this.state.selectedProduct.id);
          if (node) {
            const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
            const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
            const nodeW = node.width.targetValue ?? node.width.value ?? 0;
            const nodeH = node.height.targetValue ?? node.height.value ?? 0;

            // Set bounds for pivot LOD system
            renderer.selectedProductBounds = { x: nodeX, y: nodeY, width: nodeW, height: nodeH };

            // Update connection line position (but NOT in Hero Mode with video)
            if (this.state.dialogPosition && !this.state.isPivotHeroMode) {
              const productCenterX = nodeX + nodeW / 2;
              const productCenterY = nodeY + nodeH / 2;

              renderer.dialogConnectionPoint = { x: productCenterX, y: productCenterY };
              renderer.dialogPosition = {
                x: this.state.dialogPosition.x,
                y: this.state.dialogPosition.y + 150
              };
            } else if (this.state.isPivotHeroMode) {
              // Clear connection line in Hero Mode
              renderer.dialogConnectionPoint = null;
              renderer.dialogPosition = null;
            }
          }

          // Collect alternative images for stacked display
          // Pivot Mode: Load different perspectives of SAME variant
          // Hero Mode: Load different color variants of SAME product
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
              // Check if we're in Hero Mode
              const isHeroMode = this.state.isPivotHeroMode;

              let imagesToLoad: Array<{ storageId: number; role?: string; src?: string; variantName?: string }> = [];

              if (isHeroMode) {
                // Hero Mode: Load hero image of each unique color variant
                const uniqueVariants = getUniqueColorVariants(product);

                // Load hero images for ALL color variants (not just current)
                for (const variant of uniqueVariants) {
                  const variantImages = getImagesForVariant(product, variant);
                  if (variantImages.length > 0 && variantImages[0].storageId) {
                    // Only add hero image (first image) for each variant, include variant name
                    imagesToLoad.push({
                      ...variantImages[0],
                      variantName: variant.name
                    });
                  }
                }
              } else {
                // Pivot Mode: Load all images (perspectives) of current variant
                imagesToLoad = getImagesForVariant(product, currentVariant);
              }

              const variantImages = imagesToLoad;

              // Cancel any pending image loads from previous product
              const productGroup = `product-${this.state.selectedProduct.id}`;
              this.imageLoadQueue.cancelGroup(productGroup);

              // IMMEDIATELY load hero image with HIGHEST priority (priority: 0)
              // This ensures the main selected product image loads BEFORE alternative images
              if (variantImages.length > 0 && variantImages[0].storageId) {
                const heroStorageId = variantImages[0].storageId;
                const heroSrc = buildMediaUrl({
                  storageId: heroStorageId,
                  width: 1300,
                  quality: 85,
                  trim: false, // Keep full image as product images are not perfectly isolated
                });

                this.imageLoadQueue.add({
                  id: `${productGroup}-hero`,
                  url: heroSrc,
                  group: productGroup,
                  priority: 0, // HIGHEST PRIORITY - load hero image FIRST!
                  metadata: { storageId: heroStorageId, index: 0, isHero: true }
                }).then(result => {
                  // Hero image loaded - this is handled by LOD system
                  // No need to set it here, LOD will pick it up

                  // Fetch trim bounds for text positioning
                  const STORAGE_API_BASE = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';
                  const STORAGE_API_KEY = import.meta.env.VITE_STORAGE_API_KEY || 'oneal_demo_token';
                  const trimBoundsUrl = `${STORAGE_API_BASE}/storage/media/${heroStorageId}/trim-bounds`;
                  console.log('[App] Fetching trim bounds for storage ID:', heroStorageId, 'URL:', trimBoundsUrl);
                  fetch(trimBoundsUrl)
                    .then(async res => {
                      console.log('[App] Trim bounds response status:', res.status);
                      const data = await res.json();
                      console.log('[App] Trim bounds data received:', JSON.stringify(data, null, 2));

                      if (res.status === 404) {
                        console.warn('[App] 404 - Trim bounds not cached yet. Triggering computation...');
                        // Trigger computation by calling with ?generate=true (default is already true, but being explicit)
                        const refreshUrl = `${trimBoundsUrl}?generate=true`;
                        console.log('[App] Fetching with generate=true:', refreshUrl);
                        const refreshRes = await fetch(refreshUrl);
                        const refreshData = await refreshRes.json();
                        console.log('[App] Generate response:', JSON.stringify(refreshData, null, 2));
                        return refreshData;
                      }
                      return data;
                    })
                    .then(data => {
                      // API returns trim bounds data directly, with 'normalized' array [x1, y1, x2, y2]
                      if (data.normalized && Array.isArray(data.normalized) && data.normalized.length === 4) {
                        const [x1, y1, x2, y2] = data.normalized;
                        const trimBounds = {
                          x: x1,
                          y: y1,
                          width: x2 - x1,
                          height: y2 - y1,
                        };
                        console.log('[App] ✓ Setting trim bounds:', trimBounds, 'from normalized:', data.normalized);
                        this.setState({ heroProductTrimBounds: trimBounds });
                      } else {
                        console.warn('[App] ✗ Invalid trim bounds response data:', data);
                      }
                    })
                    .catch(err => {
                      console.error('[App] Failed to load trim bounds for storage ID', heroStorageId, ':', err);
                    });
                }).catch(error => {
                  if (error.error?.message !== 'Request cancelled' && error.error?.message !== 'Request no longer relevant') {
                    console.warn('[App] Failed to load hero image:', heroStorageId, error.error);
                  }
                });
              }

              // Load alternative images for spread animation (skip first image as it's the hero image)
              // Queue handles parallel/sequential loading and prevents browser connection limit issues
              for (let i = 1; i < variantImages.length; i++) {
                const variantImg = variantImages[i];
                const storageId = variantImg.storageId;
                const variantName = (variantImg as any).variantName; // Variant name from hero mode

                // Use high-res images (1300px @ 85% quality) - same as LOD system
                // Keep full image as product images are not perfectly isolated
                // Only specify width to preserve aspect ratio
                const src = buildMediaUrl({
                  storageId,
                  width: 1300,
                  quality: 85,
                  trim: false, // Keep full image as product images are not perfectly isolated
                });
                const imgObj: any = { storageId, src, variantName };

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

    // Update trim bounds for Hero Mode text positioning
    if (prevState.heroProductTrimBounds !== this.state.heroProductTrimBounds) {
      const renderer = this.controller.getRenderer();
      if (renderer) {
        renderer.heroProductTrimBounds = this.state.heroProductTrimBounds;
        console.log('[App] Updated renderer trim bounds:', this.state.heroProductTrimBounds);
      }
    }

  }

  private handleResize = () => {
    const canvas = this.canvasRef.current;
    const footer = this.footerRef.current;

    if (canvas && footer) {
      const footerPosition = this.state.footerPosition;
      const isMobile = window.innerWidth < 768;
      const effectivePosition = isMobile && (footerPosition === 'left' || footerPosition === 'right')
        ? 'bottom' : footerPosition;

      // Set canvas insets ONLY for footer sidebar modes (not for padding config)
      // This prevents products from going under the footer panel
      if (effectivePosition === 'left' || effectivePosition === 'right') {
        const footerWidth = footer.offsetWidth;

        if (effectivePosition === 'left') {
          canvas.style.left = `${footerWidth}px`;
          canvas.style.right = '0px';
        } else if (effectivePosition === 'right') {
          canvas.style.left = '0px';
          canvas.style.right = `${footerWidth}px`;
        }
      } else {
        // Bottom/floating modes - no insets needed
        canvas.style.left = '0px';
        canvas.style.right = '0px';
      }

      // Never set top/bottom insets (those are controlled by padding config in layout)
      canvas.style.top = '0px';
      canvas.style.bottom = '0px';
    }

    // Controller's handleResize will read CSS insets and adjust canvas accordingly
    this.controller.handleResize();
  };

  private handleOrientationChange = () => {
    const orientation = this.computePivotOrientation();
    if (orientation !== this.state.pivotOrientation) {
      this.controller.setPivotOrientation(orientation);
      this.setState({ pivotOrientation: orientation });
    }
  };

  // Dialog callbacks (as class methods to prevent re-creation on each render)
  private handleDialogPositionChange = (pos: { x: number; y: number }) => {
    // Only update if position actually changed
    const current = this.state.dialogPosition;
    if (!current || current.x !== pos.x || current.y !== pos.y) {
      this.setState({ dialogPosition: pos });
    }
  };

  private handleDialogImageSelect = (storageId: number, thumbnailImage?: HTMLImageElement) => {
    const renderer = this.controller.getRenderer();
    if (!renderer) return;

    // Immediately show thumbnail (already loaded, instant)
    if (thumbnailImage) {
      renderer.selectedVariantHeroImage = thumbnailImage;
    }

    // Then load high-res version in background
    const STORAGE_API_BASE = import.meta.env.VITE_STORAGE_API_URL || '/storage-api';
    const src = `${STORAGE_API_BASE}/storage/media/${storageId}?width=1300&format=webp&quality=85`;

    const img = new Image();
    img.onload = () => {
      if (renderer) {
        renderer.selectedVariantHeroImage = img;
      }
    };
    img.src = src;
  };

  private handleDialogVariantChange = (variant: any) => {
    // Only update if variant actually changed
    const currentVariant = this.state.selectedVariant;
    const newVariantId = variant?.sku || variant?.name || '';
    const currentVariantId = currentVariant?.sku || currentVariant?.name || '';
    if (newVariantId !== currentVariantId) {
      this.setState({ selectedVariant: variant });
    }
  };

  // Footer drag functionality
  private footerDragOffset: { x: number; y: number } | null = null;

  private handleFooterDragStart = (e: React.MouseEvent) => {
    if (this.state.footerPosition !== 'floating') return;

    // Calculate offset from mouse to footer top-left
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.footerDragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Initialize position if not set
    if (!this.state.footerFloatingPosition) {
      this.setState({
        footerFloatingPosition: {
          x: rect.left,
          y: rect.top,
        },
      });
    }

    document.addEventListener('mousemove', this.handleFooterDrag);
    document.addEventListener('mouseup', this.handleFooterDragEnd);
  };

  private handleFooterDrag = (e: MouseEvent) => {
    if (!this.footerDragOffset) return;

    const newX = e.clientX - this.footerDragOffset.x;
    const newY = e.clientY - this.footerDragOffset.y;

    // Keep within viewport bounds
    const maxX = window.innerWidth - 320; // Footer width
    const maxY = window.innerHeight - 200; // Min footer height

    this.setState({
      footerFloatingPosition: {
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(30, Math.min(newY, maxY)), // Below header
      },
    });
  };

  private handleFooterDragEnd = () => {
    this.footerDragOffset = null;
    document.removeEventListener('mousemove', this.handleFooterDrag);
    document.removeEventListener('mouseup', this.handleFooterDragEnd);
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
    // Filter out weight dimension (not useful for pivoting)
    const filteredDims = dims.filter(dim => dim !== 'attribute:weight');
    this.setState({
      pivotBreadcrumbs: this.controller.getPivotBreadcrumbs(),
      pivotDimension: currentDim,
      pivotDimensions: filteredDims,
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
    this.controller.setCellSizeOverride(newSettings.cellSizeOverride);
    this.controller.setMinCellSize(newSettings.minCellSize);
    const renderer = this.controller.getRenderer();
    if (renderer) {
      renderer.rectMode = newSettings.rectMode;
      renderer.showBoundsDebug = newSettings.showBoundsDebug;
    }
    this.controller.setIgnoreBounds(newSettings.ignoreBounds);
    const orientation = this.computePivotOrientation();
    this.controller.setPivotOrientation(orientation);
  };

  private handleBreadcrumbClick = (index: number) => {
    const { pivotBreadcrumbs } = this.state;
    if (index < 0 || index >= pivotBreadcrumbs.length) return;
    if (index === pivotBreadcrumbs.length - 1) return; // current level

    // Close dialog immediately on pivot navigation
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });

    if (index === 0) {
      this.controller.resetPivot();
      // No need to set dimension — reset returns to taxonomy root
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
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });

    this.controller.setPivotDimension(dimension);
    this.syncPivotUI();
  };

  private handleGroupSelect = (groupKey: string) => {
    // Close dialog immediately on group drill down
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });

    this.controller.drillDownGroup(groupKey);
    this.syncPivotUI();

    // Push history state for back button navigation
    this.pushHistoryState({ type: 'drillDown', groupKey, breadcrumbs: this.state.pivotBreadcrumbs });
  };

  /**
   * Global product search — independent of current pivot/filter state.
   * Space-separated terms are OR-combined; a product matches if ANY term
   * matches name / SKU / product_code.
   * `limit = 0` returns all matches (used by the filter action).
   */
  private searchAllProducts(term: string, limit = 8): Product[] {
    const tokens = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const all = this.controller.getAllProducts();
    const results: Product[] = [];
    for (const product of all) {
      const name = (product.name || '').toLowerCase();
      const sku = (product.sku || '').toLowerCase();
      const code = ((product.raw as any)?.product_code || '').toString().toLowerCase();
      const matches = tokens.some(t => name.includes(t) || sku.includes(t) || code.includes(t));
      if (matches) {
        results.push(product);
        if (limit > 0 && results.length >= limit) break;
      }
    }
    return results;
  }

  private filterFooterSearchResults(term: string): Product[] {
    return this.searchAllProducts(term, 8);
  }

  private handleFooterSearchChange = (value: string) => {
    this.setState({ footerSearchTerm: value });
  };

  private handleFooterSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Shift+Enter (or Ctrl/Cmd+Enter) → apply as filter chip
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.applySearchFilter(this.state.footerSearchTerm);
        return;
      }
      const [firstMatch] = this.filterFooterSearchResults(this.state.footerSearchTerm);
      if (firstMatch) {
        this.handleFooterSearchSelect(firstMatch.id);
      }
    }
    if (event.key === 'Escape') {
      this.setState({ footerSearchTerm: '' });
    }
  };

  private applySearchFilter = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.some(t => t.length < 2)) {
      console.warn('[searchFilter] ignored — token < 2 chars:', tokens);
      return;
    }
    const matches = this.searchAllProducts(trimmed, 0);
    const total = this.controller.getAllProducts().length;
    console.log('[searchFilter] term=', trimmed, 'matches=', matches.length, '/', total);
    if (matches.length === 0 || matches.length === total) {
      console.warn('[searchFilter] no-op — matches everything or nothing');
      return;
    }
    const ids = matches.map(p => p.id);
    this.controller.setAiFilterProductIds(ids);
    const after = this.controller.getFilteredProducts();
    console.log('[searchFilter] controller filtered after=', after.length);
    this.setState({
      searchFilterTerm: trimmed,
      footerSearchTerm: '',
    }, () => this.syncPivotUI());
  };

  private clearSearchFilter = () => {
    this.controller.clearAiFilterProductIds();
    this.setState({ searchFilterTerm: null }, () => this.syncPivotUI());
  };

  private handleFooterSearchSelect = (productId: string) => {
    const product =
      this.controller.getAllProducts().find((p) => p.id === productId) ||
      this.state.filteredProducts.find((p) => p.id === productId) ||
      this.controller.getDisplayOrder().find((p) => p.id === productId);
    if (!product) {
      return;
    }
    this.openProductDetails(product);
    this.setState({ footerSearchTerm: '' });
  };

  private getVariantKeyFromPayload(payload: { product: Product; variant?: any; variantLabel?: string }): string {
    const variant = payload.variant;
    const key = variant?.sku || variant?.id || payload.variantLabel || 'base';
    return String(key);
  }

  private handleProductBuy = (payload: {
    product: Product;
    variant?: any;
    priceText?: string;
    imageUrl?: string;
    variantLabel?: string;
    quantity?: number;
  }) => {
    const delta = payload.quantity ?? 1;
    if (delta === 0) return;
    const variantKey = this.getVariantKeyFromPayload(payload);
    const itemId = `${payload.product.id}-${variantKey}`;

    this.setState((prev) => {
      const existingIndex = prev.cartItems.findIndex(item => item.id === itemId);
      let cartItems = [...prev.cartItems];

      if (existingIndex >= 0) {
        const existing = cartItems[existingIndex];
        const newQuantity = existing.quantity + delta;
        if (newQuantity <= 0) {
          cartItems.splice(existingIndex, 1);
        } else {
          cartItems[existingIndex] = { ...existing, quantity: newQuantity };
        }
      } else if (delta > 0) {
        // Extract available colors and sizes from product variants
        const variants = payload.product.variants || [];
        const colors = Array.from(new Set(variants.map((v: any) =>
          v.color || v.option1 || v.name).filter(Boolean))) as string[];
        const sizes = Array.from(new Set(variants.map((v: any) =>
          v.size || v.option2).filter(Boolean))) as string[];

        const currentColor = payload.variant?.color || payload.variant?.option1 ||
          payload.variantLabel || payload.variant?.name || colors[0] || '';

        const newItem: CartItem = {
          id: itemId,
          productId: payload.product.id,
          variantKey,
          name: payload.product.name,
          variantLabel: payload.variantLabel || payload.variant?.name || payload.variant?.sku,
          priceText: payload.priceText,
          imageUrl: payload.imageUrl,
          quantity: delta,
          articleNumber: payload.product.sku || (payload.product.raw as any)?.product_code || '',
          color: currentColor,
          availableColors: colors.length > 0 ? colors : [currentColor],
          availableSizes: sizes.length > 0 ? sizes : ['One Size'],
          sizes: {},
        };
        cartItems = [newItem, ...cartItems];
      }

      return { cartItems };
    });
  };

  // === New tabular cart adapters ===
  private handleCartSetQuantity = (itemId: string, size: string, qty: number) => {
    this.setState(prev => {
      const cartItems = prev.cartItems.map(item => {
        if (item.id !== itemId) return item;
        const sizes = { ...(item.sizes || {}) };
        if (qty <= 0) delete sizes[size];
        else sizes[size] = qty;
        const totalQty = Object.values(sizes).reduce((s, q) => s + (q || 0), 0);
        return { ...item, sizes, quantity: totalQty };
      });
      return { cartItems };
    });
  };

  private handleCartChangeColor = (itemId: string, newColor: string) => {
    this.setState(prev => ({
      cartItems: prev.cartItems.map(item =>
        item.id === itemId ? { ...item, color: newColor } : item
      ),
    }));
  };

  private handleCartRemoveItem = (itemId: string) => {
    this.setState(prev => ({
      cartItems: prev.cartItems.filter(item => item.id !== itemId),
    }));
  };

  private handleCartSearchProducts = async (query: string): Promise<ProductSearchResult[]> => {
    return this.searchAllProducts(query, 8).map(p => ({
      productId: p.id,
      name: p.name,
      articleNumber: p.sku || (p.raw as any)?.product_code || '',
      imageUrl: p.imageUrl,
      color: (p.raw as any)?.color_name,
    }));
  };

  private handleCartAddProduct = (result: ProductSearchResult) => {
    const product = this.controller.getAllProducts().find(p => p.id === result.productId);
    if (!product) return;
    this.handleProductBuy({
      product,
      variant: getPrimaryVariant(product),
      priceText: product.priceText,
      imageUrl: product.imageUrl,
      quantity: 1,
    });
  };

  private handleCartUploadB2B = () => {
    const total = this.state.cartItems.reduce(
      (sum, item) => sum + Object.values(item.sizes || {}).reduce((s, q) => s + (q || 0), item.quantity || 0),
      0
    );
    alert(`B2B Upload: ${this.state.cartItems.length} Positionen, ${total} Stk.`);
  };

  private toCartViewItems = (): CartViewItem[] => {
    return this.state.cartItems.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.name,
      productImageUrl: item.imageUrl,
      articleNumber: item.articleNumber || '',
      color: item.color || item.variantLabel || '',
      availableColors: item.availableColors || [item.color || ''],
      availableSizes: item.availableSizes || ['One Size'],
      sizes: item.sizes || (item.quantity > 0 ? { [item.availableSizes?.[0] || 'One Size']: item.quantity } : {}),
    }));
  };

  private handleCartItemQuantityChange = (itemId: string, delta: number) => {
    if (!delta) return;
    this.setState(prev => {
      const index = prev.cartItems.findIndex(item => item.id === itemId);
      if (index === -1) return null;
      const cartItems = [...prev.cartItems];
      const target = cartItems[index];
      const newQuantity = target.quantity + delta;
      if (newQuantity <= 0) {
        cartItems.splice(index, 1);
      } else {
        cartItems[index] = { ...target, quantity: newQuantity };
      }
      return { cartItems };
    });
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

  private openProductDetails(product: Product, options: { pushHistory?: boolean } = {}) {
    const canvas = this.canvasRef.current;

    this.controller.centerOnProduct(product);

    let shouldShowV4 = false;
    const node = this.controller.getProductNode(product.id);
    if (node && canvas) {
      const productHeight = node.height.targetValue ?? node.height.value ?? 0;
      const zoom = this.controller.getZoom();
      const productScreenHeight = productHeight * zoom;
      const viewportHeight = canvas.height;
      const heightPercentage = productScreenHeight / viewportHeight;
      shouldShowV4 = heightPercentage > 0.65;
    }

    const isHeroMode = this.controller.isPivotHeroMode();
    if (isHeroMode) {
      const uniqueVariants = getUniqueColorVariants(product);
      if (uniqueVariants.length === 1) {
        shouldShowV4 = true;
      } else if (uniqueVariants.length > 1) {
        const wasAlreadySelected = this.state.selectedProduct?.id === product.id;
        shouldShowV4 = wasAlreadySelected;
      }
    }

    const primaryVariant = getPrimaryVariant(product);
    this.setState({ selectedProduct: product, selectedVariant: primaryVariant, shouldShowV4Dialog: shouldShowV4 });

    const storageId = this.getProductStorageId(product);
    if (storageId) {
      fetchAnnotations(storageId).then((annotations) => {
        const renderer = this.controller.getRenderer();
        if (renderer) {
          renderer.heroImageAnnotations = annotations;
        }
      });
    } else {
      const renderer = this.controller.getRenderer();
      if (renderer) {
        renderer.heroImageAnnotations = null;
      }
    }

    if (options.pushHistory !== false) {
      this.pushHistoryState({ type: 'productSelect', productId: product.id });
    }
  }

  private handleCanvasClick = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Suppress click after a drag/pan gesture
    const vt = this.controller.getViewportTransform();
    if (vt?.consumeDrag()) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for overlay clicks first (if overlay is visible and in canvas mode)
    if (this.state.overlayMode === 'canvas' && this.state.selectedProduct && this.state.devSettings.heroDisplayMode === 'overlay') {
      const renderer = this.controller.getRenderer();
      const overlayClick = renderer?.checkOverlayClick(x, y);

      if (overlayClick === 'close') {
        // Close the overlay
        this.setState({ selectedProduct: null, selectedVariant: null, shouldShowV4Dialog: false });
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
      this.openProductDetails(product);
    } else {
      // Clicked on empty space - deselect product
      this.setState({ selectedProduct: null, selectedVariant: null, shouldShowV4Dialog: false });
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
      // Only update mousePos if it has actually changed to prevent infinite re-renders
      const currentPos = this.state.mousePos;
      if (!currentPos || currentPos.x !== e.clientX || currentPos.y !== e.clientY) {
        this.setState({ mousePos: { x: e.clientX, y: e.clientY } });
      }
    }
  };

  private handleCanvasMouseLeave = () => {
    const canvas = this.canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
    this.setState({ hoveredProduct: null, mousePos: null });
  };

  private handleCanvasTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Suppress tap after a touch pan/drag gesture
    const vt = this.controller.getViewportTransform();
    if (vt?.consumeDrag()) return;

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
        this.setState({ selectedProduct: null, selectedVariant: null, shouldShowV4Dialog: false });
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

      // Calculate whether to show V4 dialog based on product size (zoom-based trigger)
      let shouldShowV4 = false;
      const node = this.controller.getProductNode(product.id);
      if (node && canvas) {
        const productHeight = node.height.targetValue ?? node.height.value ?? 0;
        const zoom = this.controller.getZoom();
        const productScreenHeight = productHeight * zoom;
        const viewportHeight = canvas.height;
        const heightPercentage = productScreenHeight / viewportHeight;
        shouldShowV4 = heightPercentage > 0.65;
      }

      const primaryVariant = getPrimaryVariant(product);
      this.setState({ selectedProduct: product, selectedVariant: primaryVariant, shouldShowV4Dialog: shouldShowV4 });
    } else {
      this.setState({ selectedProduct: null, selectedVariant: null, shouldShowV4Dialog: false });
    }
  };

  private handleCanvasTouchMove = (_e: TouchEvent) => {
    // No hover/tooltip on touch - only tap to select
    if (this.state.hoveredProduct) {
      this.setState({ hoveredProduct: null, mousePos: null });
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

    if ((event.key === 'M' || event.key === 'm') && event.ctrlKey && event.shiftKey) {
      event.preventDefault();
      this.setState(prev => ({
        layoutMode: prev.layoutMode === 'poster' ? 'pivot' : 'poster',
      }));
    }

    // Cycle through footer positions with Ctrl+Shift+F
    if ((event.key === 'F' || event.key === 'f') && event.ctrlKey && event.shiftKey) {
      event.preventDefault();
      const positions: FooterPosition[] = ['bottom', 'right', 'left', 'floating'];
      const currentIndex = positions.indexOf(this.state.footerPosition);
      const nextIndex = (currentIndex + 1) % positions.length;
      const nextPosition = positions[nextIndex];

      // Initialize floating position if switching to floating mode
      const floatingPos =
        nextPosition === 'floating' && !this.state.footerFloatingPosition
          ? { x: FOOTER_CONFIG.floating.defaultPosition.x, y: FOOTER_CONFIG.floating.defaultPosition.y }
          : this.state.footerFloatingPosition;

      this.setState({
        footerPosition: nextPosition,
        footerFloatingPosition: floatingPos,
      }, () => {
        // Trigger resize to recalculate layout with new canvas bounds
        requestAnimationFrame(() => this.handleResize());
      });
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
      // Save to history (deduplicate, max 10)
      const historyEntry = { query, productIds: matchedIds, resultCount: matchedIds.length };
      const existingHistory = this.state.aiSearchHistory.filter(h => h.query !== query);
      const newHistory = [historyEntry, ...existingHistory].slice(0, 10);

      this.setState({
        quickSearchLoading: false,
        isQuickSearchOpen: false,
        quickSearchPrompt: '',
        aiFilterProductIds: matchedIds,
        aiLastResultCount: matchedIds.length,
        aiSearchHistory: newHistory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Die KI-Suche ist fehlgeschlagen.';
      this.setState({ quickSearchLoading: false, quickSearchError: message });
    }
  };

  private handleAIPromptSubmit = async () => {
    if (this.state.aiPromptLoading) return;
    const query = this.state.aiPrompt.trim();
    if (!query) {
      this.setState({ aiPromptError: 'Please enter a search query' });
      return;
    }

    this.setState({ aiPromptLoading: true, aiPromptError: null });

    try {
      const { productIds } = await AiProductQueryService.queryProducts(query);
      if (!productIds.length) {
        this.setState({
          aiPromptLoading: false,
          aiPromptError: 'No products found. Try a different query.',
        });
        return;
      }
      this.controller.setAiFilterProductIds(productIds);
      const matchedProducts = this.controller.getFilteredProducts();
      const matchedIds = matchedProducts.map(p => p.id);

      if (!matchedIds.length) {
        this.setState({
          aiPromptLoading: false,
          aiPromptError: 'AI returned IDs but they don\'t match loaded products.',
        });
        return;
      }

      this.setState({
        aiPrompt: '', // Clear input after successful query
        aiPromptLoading: false,
        aiPromptError: null,
        aiFilterProductIds: matchedIds,
        aiLastResultCount: matchedIds.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI search failed';
      this.setState({ aiPromptLoading: false, aiPromptError: message });
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
    footerSearchTerm,
    searchFilterTerm,
    cartItems,
    cartPanelOpen,
    cartFullOverlay,
    } = this.state;

    // Compute availability live but keep chip order stable
    const availableDimsNow = this.controller.getAvailablePivotDimensions();

    const cats = this.controller.getUniqueCategories();
    const seasons = this.controller.getUniqueSeasons();
    const totalCartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const isSidebarFooter = this.state.footerPosition === 'left' || this.state.footerPosition === 'right';

    const getDimensionLabel = (dim: GroupDimension) => pivotDefinitions.find(d => d.key === dim)?.label ?? dim;
    const footerSearchResults = this.filterFooterSearchResults(footerSearchTerm);

    // Storage URLs from environment
    const STORAGE_API_BASE = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';
    const logoUrl = `${STORAGE_API_BASE}/storage/media/6615?variant=thumbnail&height=25&trim=true`;

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

        {/* Header bar with logo and title */}
        <div className="pf-header">
          <div className="pf-header-left">
            <div className="pf-header-logo">
              <img src={logoUrl} alt="O'NEAL" height="25" />
            </div>
            <div className="pf-header-breadcrumbs">
              {pivotBreadcrumbs.map((crumb, i) => (
                <React.Fragment key={`header-${crumb}-${i}`}>
                  {i > 0 && <span className="pf-header-breadcrumb-sep">›</span>}
                  <span
                    role="button"
                    tabIndex={i === pivotBreadcrumbs.length - 1 ? -1 : 0}
                    className={`pf-header-breadcrumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''}`}
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
              {searchFilterTerm && (
                <span className="pf-search-filter-chip" title="Click ✕ to remove search filter">
                  <span className="pf-search-filter-chip-icon">🔍</span>
                  <span className="pf-search-filter-chip-text">{searchFilterTerm}</span>
                  <button
                    type="button"
                    className="pf-search-filter-chip-close"
                    onClick={this.clearSearchFilter}
                    aria-label="Remove search filter"
                  >×</button>
                </span>
              )}
            </div>
          </div>
          <div className="pf-header-search">
            <div className="pf-header-search-inner">
              <input
                type="text"
                className="pf-header-search-input"
                placeholder="Search visible products..."
                value={footerSearchTerm}
                onChange={(e) => this.handleFooterSearchChange(e.target.value)}
                onKeyDown={this.handleFooterSearchKeyDown}
              />
              {footerSearchTerm.trim().length > 0 && (
                <div className="pf-header-search-results">
                  {footerSearchResults.length === 0 ? (
                    <div className="pf-header-search-empty">No matches</div>
                  ) : (
                    <>
                      {footerSearchResults.map((product) => (
                        <button
                          type="button"
                          key={`header-result-${product.id}`}
                          className="pf-header-search-result"
                          onClick={() => this.handleFooterSearchSelect(product.id)}
                        >
                          <span className="pf-header-search-name">{product.name}</span>
                          {product.price?.formatted && (
                            <span className="pf-header-search-price">{product.price.formatted}</span>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="pf-header-search-filter-action"
                        onClick={() => this.applySearchFilter(footerSearchTerm)}
                        title="Filter view to all matching products (Shift+Enter)"
                      >
                        <span>🔍 Als Filter anwenden</span>
                        <span className="pf-header-search-filter-hint">Shift+Enter</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="pf-header-actions">
            <button
              type="button"
              className={`pf-header-btn ${this.controller.isFamilyGrouped() ? 'active' : ''}`}
              onClick={() => {
                this.controller.setFamilyGrouped(!this.controller.isFamilyGrouped());
                this.syncPivotUI();
              }}
              title={this.controller.isFamilyGrouped() ? 'Grouped by product family' : 'Showing all color variants'}
            >
              {this.controller.isFamilyGrouped() ? 'Grouped' : 'All Colors'}
            </button>
            <button
              type="button"
              className={`pf-header-btn ${this.controller.getLayoutMode() === 'lanes' ? 'active' : ''}`}
              onClick={() => {
                const current = this.controller.getLayoutMode();
                this.controller.setLayoutMode(current === 'lanes' ? 'pivot' : 'lanes');
                this.syncPivotUI();
                setTimeout(() => this.controller.handleResize(), 50);
              }}
              title={this.controller.getLayoutMode() === 'lanes' ? 'Lane view (shop style)' : 'Pivot view'}
            >
              {this.controller.getLayoutMode() === 'lanes' ? 'Lanes' : 'Pivot'}
            </button>
          </div>
          <div className="pf-header-title">Product Finder</div>
          {/* Mobile: hamburger menu + gear */}
          <div className="pf-mobile-icons">
            <button type="button" className="pf-mobile-icon-btn" onClick={() => this.setState({ mobilePivotOpen: !this.state.mobilePivotOpen })}>
              <i className="fa-solid fa-bars"></i>
            </button>
            <button type="button" className="pf-mobile-icon-btn" onClick={() => window.dispatchEvent(new Event('pf-toggle-dev-overlay'))}>
              <i className="fa-solid fa-gear"></i>
            </button>
          </div>
        </div>

        {/* Mobile Pivot Overlay */}
        {this.state.mobilePivotOpen && (
          <div className="pf-mobile-pivot-overlay">
            <div className="pf-mobile-pivot-header">
              <span>Menu</span>
              <button type="button" className="pf-mobile-search-close" onClick={() => this.setState({ mobilePivotOpen: false })}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* View Mode */}
            <div className="pf-mobile-pivot-label">Ansicht</div>
            <div className="pf-mobile-pivot-dims" style={{ marginBottom: 20 }}>
              <button type="button" className={`pf-mobile-pivot-dim ${!this.controller.isFamilyGrouped() ? 'active' : ''}`}
                onClick={() => { this.controller.setFamilyGrouped(false); this.syncPivotUI(); }}>
                <i className="fa-solid fa-palette" style={{ marginRight: 6 }}></i>All Colors
              </button>
              <button type="button" className={`pf-mobile-pivot-dim ${this.controller.isFamilyGrouped() ? 'active' : ''}`}
                onClick={() => { this.controller.setFamilyGrouped(true); this.syncPivotUI(); }}>
                <i className="fa-solid fa-object-group" style={{ marginRight: 6 }}></i>Grouped
              </button>
              <button type="button" className={`pf-mobile-pivot-dim ${this.controller.getLayoutMode() === 'pivot' ? 'active' : ''}`}
                onClick={() => { this.controller.setLayoutMode('pivot'); this.syncPivotUI(); setTimeout(() => this.controller.handleResize(), 50); }}>
                <i className="fa-solid fa-grip" style={{ marginRight: 6 }}></i>Pivot
              </button>
              <button type="button" className={`pf-mobile-pivot-dim ${this.controller.getLayoutMode() === 'lanes' ? 'active' : ''}`}
                onClick={() => { this.controller.setLayoutMode('lanes'); this.syncPivotUI(); setTimeout(() => this.controller.handleResize(), 50); }}>
                <i className="fa-solid fa-bars-staggered" style={{ marginRight: 6 }}></i>Lanes
              </button>
            </div>

            {/* Breadcrumbs */}
            <div className="pf-mobile-pivot-label">Navigation · {getDimensionLabel(pivotDimension)}</div>
            <div className="pf-mobile-pivot-breadcrumbs">
              {pivotBreadcrumbs.map((crumb, i) => (
                <button type="button" key={`mobile-crumb-${crumb}-${i}`}
                  className={`pf-mobile-pivot-crumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''}`}
                  onClick={() => { this.handleBreadcrumbClick(i); this.setState({ mobilePivotOpen: false }); }}>
                  {crumb}
                </button>
              ))}
            </div>

            {/* Dimension Picker */}
            <div className="pf-mobile-pivot-label">Dimension</div>
            <div className="pf-mobile-pivot-dims">
              {pivotDimensions
                .filter(dim => availableDimsNow.includes(dim))
                .map(dim => (
                  <button type="button" key={`mobile-dim-${dim}`}
                    className={`pf-mobile-pivot-dim ${dim === pivotDimension ? 'active' : ''}`}
                    onClick={() => { this.handleDimensionClick(dim); this.setState({ mobilePivotOpen: false }); }}>
                    {getDimensionLabel(dim)}
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className={`pf-stage pf-stage-${this.state.footerPosition}`}>
          {this.useArcturianRenderer() ? (
            <Suspense fallback={<div className="pf-canvas" style={{ background: '#fff' }} />}>
              <ArcturianRendererComponent
                getNodes={() => this.controller.getLayoutEngine()?.all() ?? []}
                getHeaders={() => this.controller.getLayoutService()?.getGroupHeaders() ?? []}
                productToAtlasIndex={this.getProductAtlasIndex()}
                onBucketClick={(label) => {
                  this.controller.handleGroupHeaderClick_byLabel?.(label);
                  this.syncPivotUI();
                }}
                width={window.innerWidth}
                height={window.innerHeight}
              />
            </Suspense>
          ) : null}
          <canvas ref={this.canvasRef} className="pf-canvas" style={this.useArcturianRenderer() ? { position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 } : undefined} />

          {/* Navigation arrows - visible when a product is selected */}
          {selectedProduct && this.state.modalSequence.length > 1 && (
            <>
              {this.state.selectedIndex > 0 && (
                <button
                  type="button"
                  className="pf-nav-arrow pf-nav-prev"
                  onClick={() => this.showRelativeProduct(-1)}
                  aria-label="Previous product"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
              )}
              {this.state.selectedIndex < this.state.modalSequence.length - 1 && (
                <button
                  type="button"
                  className="pf-nav-arrow pf-nav-next"
                  onClick={() => this.showRelativeProduct(1)}
                  aria-label="Next product"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 6 15 12 9 18"></polyline>
                  </svg>
                </button>
              )}
            </>
          )}

          {/* Force labels overlay (only for force-labels mode) - rendered as HTML */}
          {isPivotHeroMode && selectedProduct && this.state.devSettings.heroDisplayMode === 'force-labels' && this.canvasRef.current && (() => {
            const canvas = this.canvasRef.current!;
            const node = this.controller.getProductNode(selectedProduct.id);
            if (!node) return null;

            const viewport = this.controller.getViewportTransform();
            if (!viewport) return null;

            const nodeX = node.posX.targetValue ?? node.posX.value ?? 0;
            const nodeY = node.posY.targetValue ?? node.posY.value ?? 0;
            const nodeWidth = node.width.targetValue ?? node.width.value ?? 0;
            const nodeHeight = node.height.targetValue ?? node.height.value ?? 0;

            // Calculate anchor point and dimensions from trim bounds (if available)
            // Trim bounds are normalized (0-1), scale them to node dimensions
            const trimBounds = this.state.heroProductTrimBounds;

            let anchorX, anchorY, productWidth, productHeight;

            if (trimBounds) {
              // Use trim bounds center as anchor
              anchorX = nodeX + (trimBounds.x + trimBounds.width / 2) * nodeWidth;
              anchorY = nodeY + (trimBounds.y + trimBounds.height / 2) * nodeHeight;
              productWidth = trimBounds.width * nodeWidth;
              productHeight = trimBounds.height * nodeHeight;
            } else {
              // Fallback to image center
              anchorX = nodeX + nodeWidth / 2;
              anchorY = nodeY + nodeHeight / 2;
              productWidth = undefined;
              productHeight = undefined;
            }

            return (
              <ProductAnnotations
                product={selectedProduct}
                anchorX={anchorX}
                anchorY={anchorY}
                productWidth={productWidth}
                productHeight={productHeight}
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

        <div
          ref={this.footerRef}
          className={`pf-bottom-bar pf-footer-${this.state.footerPosition} ${this.state.mobileFooterExpanded ? 'expanded' : 'collapsed'}`}
          style={
            this.state.footerPosition === 'floating' && this.state.footerFloatingPosition
              ? {
                  '--footer-floating-x': `${this.state.footerFloatingPosition.x}px`,
                  '--footer-floating-y': `${this.state.footerFloatingPosition.y}px`,
                } as React.CSSProperties
              : undefined
          }
          onMouseDown={this.state.footerPosition === 'floating' ? this.handleFooterDragStart : undefined}
        >
          {/* Desktop: AI Search section */}
          <div className="pf-bottom-section pf-bottom-left pf-bottom-desktop-section">
            <button
              type="button"
              className="pf-ai-search-btn"
              onClick={() => this.setState({ isQuickSearchOpen: true })}
              title="KI-Produktsuche (F3)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              Ask AI
            </button>
            {this.state.aiFilterProductIds.length > 0 && (
              <button type="button" className="pf-ai-clear-btn" onClick={this.clearAiFilter} title="Filter zurücksetzen">
                {this.state.aiLastResultCount} Treffer &times;
              </button>
            )}
            {this.state.aiSearchHistory.length > 0 && (
              <div className="pf-ai-history">
                {this.state.aiSearchHistory.map((entry, idx) => (
                  <button
                    key={`ai-hist-${idx}`}
                    type="button"
                    className="pf-ai-history-item"
                    onClick={() => {
                      this.controller.setAiFilterProductIds(entry.productIds);
                      this.setState({
                        aiFilterProductIds: entry.productIds,
                        aiLastResultCount: entry.resultCount,
                      });
                    }}
                    title={`${entry.resultCount} Treffer`}
                  >
                    {entry.query}
                    <span className="pf-ai-history-count">{entry.resultCount}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop: DIMENSIONS section (always visible) */}
          <div className="pf-bottom-section pf-bottom-center pf-bottom-desktop-section">
            {isPivotHeroMode && (layoutMode === 'pivot' || layoutMode === 'lanes') ? (
              <>
                <span className="pf-bottom-label">Sort</span>
                <div className="pf-bottom-sort-hero">
                  {[
                    { value: 'none', label: 'None', icon: '−' },
                    { value: 'name-asc', label: 'Name ↑', icon: 'A↑' },
                    { value: 'name-desc', label: 'Name ↓', icon: 'Z↓' },
                    { value: 'price-asc', label: 'Price ↑', icon: '€↑' },
                    { value: 'price-desc', label: 'Price ↓', icon: '€↓' },
                    { value: 'weight-asc', label: 'Weight ↑', icon: '⚖↑' },
                    { value: 'weight-desc', label: 'Weight ↓', icon: '⚖↓' },
                    { value: 'color-asc', label: 'Color ↑', icon: '🎨↑' },
                    { value: 'color-desc', label: 'Color ↓', icon: '🎨↓' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`pf-sort-chip ${sortMode === opt.value ? 'active' : ''}`}
                      onClick={() => this.setState({ sortMode: opt.value as SortMode, selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                      title={opt.label}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span className="pf-bottom-label">Dimensions</span>
                <div className={`pf-bottom-dimensions ${isSidebarFooter ? 'pf-bottom-dimensions-horizontal' : ''}`}>
                  {(layoutMode === 'pivot' || layoutMode === 'lanes') ? (
                    <div className={`pf-bottom-dimension-row ${isSidebarFooter ? 'pf-bottom-dimension-row-horizontal' : ''}`}>
                      {pivotDimensions
                        .filter(dim => availableDimsNow.includes(dim))
                        .map(dim => (
                          <button
                            type="button"
                            key={dim}
                            className={`pf-pivot-chip ${dim === pivotDimension ? 'active' : ''}`}
                            onClick={() => this.handleDimensionClick(dim)}
                            aria-current={dim === pivotDimension}
                            style={!isSidebarFooter ? { width: '100%' } : undefined}
                          >
                            {getDimensionLabel(dim)}
                          </button>
                        ))}
                    </div>
                  ) : (
                    <span className="pf-bottom-placeholder">Dimensions available in Pivot layout</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Desktop: SORT section (hidden in Hero Mode) */}
          {!(isPivotHeroMode && (layoutMode === 'pivot' || layoutMode === 'lanes')) && (
            <div className="pf-bottom-section pf-bottom-right pf-bottom-desktop-section">
              <label className="pf-bottom-label" htmlFor="pf-bottom-sort">Sort</label>
              <CustomSelect
                value={sortMode}
                onChange={(value) => this.setState({ sortMode: value as SortMode, selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'name-asc', label: 'Name (A-Z)' },
                  { value: 'name-desc', label: 'Name (Z-A)' },
                  { value: 'price-asc', label: 'Price (Low-High)' },
                  { value: 'price-desc', label: 'Price (High-Low)' },
                  { value: 'weight-asc', label: 'Weight (Light-Heavy)' },
                  { value: 'weight-desc', label: 'Weight (Heavy-Light)' },
                  { value: 'color-asc', label: 'Color (A-Z)' },
                  { value: 'color-desc', label: 'Color (Z-A)' },
                ]}
              />
            </div>
          )}

          <div className="pf-bottom-section pf-bottom-right pf-bottom-desktop-section">
            <label className="pf-bottom-label">Cart</label>
            <button
              type="button"
              onClick={() => this.setState({ cartPanelOpen: true })}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: cartItems.length > 0 ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.05)',
                border: cartItems.length > 0 ? '1px solid rgba(63,185,80,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '10px 16px', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
                width: '100%', justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                {cartItems.length === 0 ? 'Warenkorb leer' : `${cartItems.length} ${cartItems.length === 1 ? 'Position' : 'Positionen'}`}
              </span>
              {totalCartQuantity > 0 && (
                <span style={{
                  background: '#3fb950', color: '#fff', borderRadius: 12,
                  padding: '2px 8px', fontSize: 11, fontWeight: 700,
                }}>{totalCartQuantity}</span>
              )}
            </button>
          </div>

          {/* Desktop: RESET button (always visible) */}
          <div className="pf-bottom-section pf-bottom-right pf-bottom-desktop-section">
            <label className="pf-bottom-label">Reset</label>
            <button
              className="pf-reset-button"
              onClick={() => {
                // Navigate back one level in breadcrumbs
                if (pivotBreadcrumbs.length > 1) {
                  this.handleBreadcrumbClick(pivotBreadcrumbs.length - 2);
                } else {
                  // Already at start - reset everything
                  const initialState = createInitialState();
                  this.setState({
                    sortMode: initialState.sortMode,
                    pivotBreadcrumbs: initialState.pivotBreadcrumbs,
                    selectedProduct: null,
                    selectedVariant: null,
                    dialogPosition: null,
                    shouldShowV4Dialog: false,
                    aiFilterProductIds: [],
                    aiLastResultCount: null,
                    aiPrompt: '',
                  });
                  this.controller.resetPivot();
                }
              }}
              title={pivotBreadcrumbs.length > 1 ? `Zurück zu ${pivotBreadcrumbs[pivotBreadcrumbs.length - 2]}` : 'Reset to start view'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              {pivotBreadcrumbs.length > 1
                ? `Zurück zu ${pivotBreadcrumbs[pivotBreadcrumbs.length - 2]}`
                : 'START'}
            </button>
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
                {cartItems.length > 0 && (
                <div className="pf-bottom-collapsed-row">
                  <span className="pf-bottom-summary-text">Cart: {totalCartQuantity}</span>
                </div>
              )}
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
                  onChange={(value) => this.setState({ sortMode: value as SortMode, selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'name-asc', label: 'Name (A-Z)' },
                    { value: 'name-desc', label: 'Name (Z-A)' },
                    { value: 'price-asc', label: 'Price (Low-High)' },
                    { value: 'price-desc', label: 'Price (High-Low)' },
                    { value: 'weight-asc', label: 'Weight (Light-Heavy)' },
                    { value: 'weight-desc', label: 'Weight (Heavy-Light)' },
                    { value: 'color-asc', label: 'Color (A-Z)' },
                    { value: 'color-desc', label: 'Color (Z-A)' },
                  ]}
                />
              </div>

              <div className="pf-bottom-section pf-bottom-center pf-bottom-mobile-section">
                <div className="pf-bottom-dimensions">
                  {(layoutMode === 'pivot' || layoutMode === 'lanes') ? (
                    <div className="pf-bottom-dimension-row">
                      {pivotDimensions
                        .filter(dim => availableDimsNow.includes(dim))
                        .map(dim => (
                          <button
                            type="button"
                            key={dim}
                            className={`pf-pivot-chip ${dim === pivotDimension ? 'active' : ''}`}
                            onClick={() => this.handleDimensionClick(dim)}
                            aria-current={dim === pivotDimension}
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

              <div className="pf-bottom-section pf-bottom-right pf-bottom-mobile-section">
                <span className="pf-bottom-label">CART</span>
                {cartItems.length === 0 ? (
                  <div className="pf-cart-empty">Cart is empty</div>
                ) : (
                  <div className="pf-cart-list">
                    {cartItems.map((item) => (
                      <div key={`mobile-cart-${item.id}`} className="pf-cart-item">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="pf-cart-thumb" />
                        ) : (
                          <div className="pf-cart-thumb pf-cart-thumb-placeholder">?</div>
                        )}
                        <div className="pf-cart-item-info">
                          <div className="pf-cart-item-name">{item.name}</div>
                          {item.variantLabel && <div className="pf-cart-item-variant">{item.variantLabel}</div>}
                          <div className="pf-cart-item-bottom">
                            {item.priceText && <div className="pf-cart-item-price">{item.priceText}</div>}
                            <div className="pf-cart-qty">
                              <button type="button" onClick={() => this.handleCartItemQuantityChange(item.id, -1)} aria-label="Decrease quantity">
                                −
                              </button>
                              <span>{item.quantity}</span>
                              <button type="button" onClick={() => this.handleCartItemQuantityChange(item.id, 1)} aria-label="Increase quantity">
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* React Product Info Panel (fixed right side OR zoom-based V4 Dialog with Video) */}
        <AnimatePresence>
          {this.state.overlayMode === 'react' && selectedProduct && (() => {
            // Determine video based on product sport (MTB vs MX)
            const sportValue = this.getProductSport(selectedProduct).toLowerCase();
            const isMotocross = sportValue.includes('motocross') || sportValue.includes('mx') || sportValue.includes('moto');

            // Video IDs:
            // - Mountainbike (MTB): 6623
            // - Motocross (MX): 6629
            const videoStorageId = isMotocross ? 6629 : 6623;

            return (
              // V4 Dialog (zoom-based): Shown when product occupies >65% of screen height
              this.state.shouldShowV4Dialog && !this.state.isPivotHeroMode ? (
                <HeroVideoBackground
                  storageId={videoStorageId}
                  onClose={() => this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                >
                  <ProductOverlayModalV4
                    product={selectedProduct}
                    onClose={() => this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                    onPositionChange={this.handleDialogPositionChange}
                    onVariantChange={this.handleDialogVariantChange}
                    onBuy={this.handleProductBuy}
                  />
                </HeroVideoBackground>
              ) : (
              // V2 Dialog: Default dialog for normal zoom levels
              <ProductOverlayModal
                product={selectedProduct}
                onClose={() => this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}
                onPositionChange={this.handleDialogPositionChange}
                onVariantChange={this.handleDialogVariantChange}
                onImageSelect={this.handleDialogImageSelect}
                onBuy={this.handleProductBuy}
              />
            )
            );
          })()}
        </AnimatePresence>
        
        {/* Product hover tooltip removed */}

        <DeveloperOverlay
          settings={this.state.devSettings}
          onSettingsChange={this.handleDevSettingsChange}
          productCount={this.state.filteredProducts.length}
          fps={this.state.fps}
          zoom={this.state.zoom}
          drawTimeMs={this.controller.getRenderer()?.drawTimeMs ?? 0}
          visibleCount={this.controller.getRenderer()?.visibleCount ?? 0}
          culledCount={this.controller.getRenderer()?.culledCount ?? 0}
          productLimit={this.state.productLimit ?? 5000}
          onProductLimitChange={(limit) => {
            this.setState({ productLimit: limit });
            this.controller.setProductLimit(limit);
          }}
        />

        {/* Cart Panel — Slide-in from right, optional fullscreen overlay */}
        {cartFullOverlay && cartPanelOpen && (
          <SlidePanelBackdrop
            open={cartPanelOpen}
            onClick={() => this.setState({ cartPanelOpen: false, cartFullOverlay: false })}
          />
        )}
        <SlidePanel
          open={cartPanelOpen}
          width={cartFullOverlay ? '90vw' : '60vw'}
          side="right"
        >
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              padding: '8px 16px 0', background: '#0f0f12',
            }}>
              <button
                onClick={() => this.setState({ cartFullOverlay: !cartFullOverlay })}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', padding: '4px 10px', borderRadius: 4,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}
                title={cartFullOverlay ? 'Side Panel' : 'Vollbild'}
              >{cartFullOverlay ? '◐ Side' : '◯ Full'}</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <CartView
                items={this.toCartViewItems()}
                onSetQuantity={this.handleCartSetQuantity}
                onChangeColor={this.handleCartChangeColor}
                onRemoveItem={this.handleCartRemoveItem}
                onSearchProducts={this.handleCartSearchProducts}
                onAddProduct={this.handleCartAddProduct}
                onUploadB2B={this.handleCartUploadB2B}
                onClose={() => this.setState({ cartPanelOpen: false, cartFullOverlay: false })}
              />
            </div>
          </div>
        </SlidePanel>
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

  private getProductSport(product?: Product | null): string {
    if (!product) return '';
    const attributes = product.attributes || {};
    const sportAttr = attributes['sport'];
    const taxonomyAttr = attributes['taxonomy_sport'];
    const attributeValue = [sportAttr, taxonomyAttr]
      .map((attr) => (typeof attr?.value === 'string' ? attr.value.trim() : ''))
      .find((val) => Boolean(val));
    if (attributeValue) {
      return attributeValue;
    }

    const rawTaxonomy = (product as any)?.derived_taxonomy || product.raw?.derived_taxonomy;
    if (rawTaxonomy?.sport && typeof rawTaxonomy.sport === 'string') {
      return rawTaxonomy.sport.trim();
    }

    const meta = (product.meta || {}) as Record<string, unknown>;
    const metaSport = typeof meta?.sport === 'string' ? meta.sport : undefined;
    const metaSource = typeof meta?.source === 'string' ? meta.source : undefined;
    return (metaSport || metaSource || '').toString().trim();
  }

  private getSportBadge(product?: Product | null): string {
    const sportValue = this.getProductSport(product).toLowerCase();
    if (!sportValue) return '';
    if (sportValue.includes('motocross') || sportValue.includes('mx') || sportValue.includes('moto')) {
      return 'MX';
    }
    if (sportValue.includes('mountain') || sportValue.includes('bike') || sportValue.includes('mtb')) {
      return 'MTB';
    }
    return sportValue.toUpperCase();
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
      this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
    } else if (state.type === 'drillDown') {
      // User navigated back from drill down - go back one breadcrumb level
      const { pivotBreadcrumbs } = this.state;
      if (pivotBreadcrumbs.length > 1) {
        this.handleBreadcrumbClick(pivotBreadcrumbs.length - 2);
      }
    }
  };
}
