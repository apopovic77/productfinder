import React, { lazy, Suspense } from 'react';
import './App.css';
import { CartView } from './components/cart/CartView';
import { submitOrder } from './services/OrderService';
import { SlidePanel, SlidePanelBackdrop } from './components/cart/SlidePanel';
import './components/cart/CartView.css';
import type { CartItem as CartViewItem, ProductSearchResult } from './components/cart/types';

// Lazy-load Arcturian renderer (only when ?renderer=arcturian)
const ArcturianRendererComponent = lazy(() =>
  import('./render/ArcturianRenderer').then(m => ({ default: m.ArcturianRendererComponent }))
);
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import { ProductAnnotations } from './components/ProductAnnotations';
import { ProductOverlayModalV2 as ProductOverlayModal } from './components/ProductOverlayModalV2';
import { ProductOverlayModalV4 } from './components/ProductOverlayModalV4';
import { HeroVideoBackground } from './components/HeroVideoBackground';
import { AnimatePresence } from 'framer-motion';
import { fetchAnnotations } from './services/StorageAnnotationService';
import { DeveloperOverlay, type DeveloperSettings } from './components/DeveloperOverlay';
import { CustomSelect } from './components/CustomSelect';
import type { SortMode } from './services/FilterService';
import type { LayoutMode } from './services/LayoutService';
import type { GroupDimension } from './types/pivot';
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
import { soundService } from './services/SoundService';
import { resolveProductTapStage } from './utils/ProductTapFlow';
import QuickSearchCommandPalette from './components/QuickSearchCommandPalette';
import { AiProductQueryService } from './services/AiProductQueryService';
import { categoryMediaService } from './services/CategoryMediaService';
import { FOOTER_CONFIG, type FooterPosition } from './config/FooterConfig';
import { STORAGE_API_BASE as CENTRAL_STORAGE_BASE, STORAGE_API_KEY as CENTRAL_STORAGE_KEY } from './config/apiConfig';
import { CATALOG_ENTRY_CONFIG, getLocalizedLabel, type CatalogEntrySelection } from './config/CatalogEntryConfig';
import { writeCatalogUrl } from './utils/catalogEntryUrl';
import { buildBrandUrl, type BrandFacet } from './utils/brandSelection';
import { createPortal } from 'react-dom';
import { fetchFacets } from './data/ProductRepository';
import { ProductFinderRealtimeSurface } from './components/ProductFinderRealtimeSurface';

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

type Props = {
  /** null = Flow-Variante ohne Marken-Gate: alle Marken im Katalog */
  brand: string | null;
  canChangeBrand: boolean;
  onRequestBrandSelection: () => void;
  locale: string;
  catalogYear: number;
  /** null = Flow-Variante 'direct': Finder startet ungefiltert */
  entrySelection: CatalogEntrySelection | null;
  sportLabel: string;
  categoryLabel: string;
  onRequestCatalogLanding: () => void;
  onRequestSportSelection: () => void;
  onRequestCategorySelection: () => void;
  realtimeDemoEnabled: boolean;
  realtimeDemoAvailable: boolean;
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
  availableBrands: BrandFacet[];
  pivotDimensions: GroupDimension[];
  pivotOrientation: Orientation;
  pivotGroups: PivotGroup[];
  pivotDefinitions: PivotDimensionDefinition[];
  isPivotHeroMode: boolean;
  /** Hero mode: which product is centred (0-based) and how many there are. */
  heroPosition: { index: number; count: number } | null;
  
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

  // V4 Dialog trigger (second tap on the already previewed product)
  shouldShowV4Dialog: boolean;

  // Hero product trim bounds (for text positioning)
  heroProductTrimBounds: { x: number; y: number; width: number; height: number } | null;
  heroProductPolygon: { x: number; y: number }[] | null;

  // Footer helpers
  footerSearchTerm: string;
  searchFilterTerm: string | null;
  cartItems: CartItem[];
  orderSubmitting: boolean;
  orderResult: string | null;
  orderError: string | null;
  cartPanelOpen: boolean;
  cartFullOverlay: boolean;
  realtimeShortcutEnabled: boolean;
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
    availableBrands: [],
    pivotDimensions: [],
    pivotOrientation: 'columns',
    pivotGroups: [],
    pivotDefinitions: [],
    isPivotHeroMode: false,
    heroPosition: null,

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
    orderSubmitting: false,
    orderResult: null,
    orderError: null,
    cartPanelOpen: false,
    cartFullOverlay: false,
    // ?voice=1 blendet die Realtime-Flaeche ohne Tastatur ein (Handy/Tablet,
    // owner 2026-08-26 „wie am Handy testen"); Desktop zusaetzlich Ctrl+Shift+V.
    realtimeShortcutEnabled: typeof window !== 'undefined'
      && ['1', 'true'].includes(new URLSearchParams(window.location.search).get('voice') ?? ''),
  };
};

export default class App extends React.Component<Props, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private footerRef = React.createRef<HTMLDivElement>();
  private controller = new ProductFinderController();
  private fpsRaf: number | null = null;
  private fpsLastSample = 0;
  private fpsFrameCount = 0;

  // Use global shared image queue for truly sequential loading
  private imageLoadQueue = globalImageQueue;
  private selectedMediaGroup: string | null = null;
  private selectedHeroRequestKey: string | null = null;
  private selectedHeroRequestId: string | null = null;
  /**
   * Desktop product presentation = the hero dock (dark card right, product
   * free on the left, backdrop word), regardless of whether the product was
   * clicked in hero mode or straight in the pivot grid (owner, 2026-08-23,
   * storage 120476: the grid still opened the old light card on top of
   * the helmet with a connection line and fan-out).
   */
  private usesHeroDock(): boolean {
    return !this.isMobileLayout();
  }

  /** Phone layout: the footer is a collapsed bottom bar there and stays. */
  private isMobileLayout(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 768;
  }

  private useArcturianRenderer(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('renderer') === 'arcturian';
  }

  state: State = createInitialState();

  async componentDidMount() {
    window.addEventListener('keydown', this.handleRealtimeDemoHotkey);
    // Marken fuer das Breadcrumb-Dropdown (Markenwechsel im Kontext)
    fetchFacets().then((data: any) => {
      const brands = Array.isArray(data?.brands)
        ? data.brands.filter((b: any) => typeof b?.name === 'string' && (b.count_with_image ?? 0) > 0)
        : [];
      this.setState({ availableBrands: brands });
    }).catch(() => { /* Dropdown bleibt leer, Crumb-Klick geht weiter zur Markenwahl */ });
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Load category media in parallel with controller initialization
    const mediaPromise = categoryMediaService.load().catch(err => {
      console.warn('[App] Failed to load category media, continuing without hero images:', err);
    });

    // Configure controller BEFORE initialize (avoids multiple layout re-triggers)
    this.controller.productsOnGpu = this.useArcturianRenderer();
    // Dev/diagnostics handle: lets a test or the owner inspect the live pivot
    // engine (which dimension, which buckets) from the console. Read-only use.
    if (typeof window !== 'undefined') (window as any).__pfController = this.controller;
    if (typeof window !== "undefined") (window as any).__pfApp = this;
    this.controller.preConfig = {
      gridConfig: this.state.devSettings.gridConfig,
      animationDuration: this.state.devSettings.animationDuration,
      priceBucketMode: this.state.devSettings.priceBucketMode,
      priceBucketCount: this.state.devSettings.priceBucketCount,
      minCellSize: this.state.devSettings.minCellSize,
      cellSizeOverride: this.state.devSettings.cellSizeOverride,
      orientation: this.computePivotOrientation(),
      brand: this.props.brand ?? undefined,
      entrySelection: this.props.entrySelection ?? undefined,
    };
    await this.controller.initialize(canvas);
    await mediaPromise;
    this.setState({ pivotOrientation: this.controller.preConfig.orientation ?? this.state.pivotOrientation }, () => this.syncPivotUI());

    // Listen to controller state changes
    this.controller.addListener(state => {
      this.maybeAutoOpenSingleHero();
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
    canvas.addEventListener('touchmove', this.handleCanvasTouchMove, { passive: true }); // Passive for better scroll performance

    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keydown', this.handleQuickSearchHotkey);

    // Setup browser history management for back button
    window.addEventListener('popstate', this.handlePopState);
    // The entry shell already owns the preceding browser-history steps.
    // Replace the current catalog state instead of duplicating the URL, so a
    // single Back returns from the catalog to category selection.
    history.replaceState(
      { ...(history.state ?? {}), type: 'initial', breadcrumbs: this.state.pivotBreadcrumbs },
      '',
      window.location.href,
    );

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
    window.removeEventListener('keydown', this.handleRealtimeDemoHotkey);
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

  private sheetObserver: ResizeObserver | null = null;

  componentDidUpdate(prevProps: Props, prevState: State): void {
    // Phone bottom sheet: publish its real height so the hero arrows and
    // counter sit just above it (48vh is only the sheet's maximum).
    if ((prevState.selectedProduct !== this.state.selectedProduct
        || prevState.selectedVariant !== this.state.selectedVariant) && this.state.selectedProduct) {
      this.preloadDialogGallery();
    }
    if (prevState.selectedProduct && !this.state.selectedProduct) {
      this.controller.exitHeroPresentation();
    }
    if (prevState.selectedProduct !== this.state.selectedProduct && this.isMobileLayout()) {
      this.sheetObserver?.disconnect();
      this.sheetObserver = null;
      requestAnimationFrame(() => {
        const sheet = document.querySelector<HTMLElement>('.pom-info-panel');
        const stage = document.querySelector<HTMLElement>('.pf-stage');
        if (!stage) return;
        if (!sheet || !this.state.selectedProduct) { stage.style.removeProperty('--pf-sheet-h'); return; }
        const publish = () => {
          const sheetRect = sheet.getBoundingClientRect();
          const stageRect = stage.getBoundingClientRect();
          stage.style.setProperty('--pf-sheet-h', `${Math.round(sheetRect.height + 8)}px`);
          // Abstand Stage-UNTERKANTE -> Sheet-OBERKANTE: die Stage endet auf
          // iOS hinter der Browser-Toolbar, das Sheet ist viewport-fixed —
          // 'bottom: sheetH+16' relativ zur Stage lag darum unterm Sheet
          // (media 120703). Pfeile/Counter haengen jetzt an dieser Messung.
          stage.style.setProperty('--pf-sheet-gap', `${Math.round(Math.max(0, stageRect.bottom - sheetRect.top))}px`);
          // Produkt ins gemessene Band zentrieren (Sheet-Hoehe ist erst
          // jetzt bekannt bzw. gewachsen).
          this.controller.refitPhoneBand();
        };
        publish();
        // The sheet animates in and grows as its content loads — follow it.
        if (typeof ResizeObserver !== 'undefined') {
          this.sheetObserver = new ResizeObserver(publish);
          this.sheetObserver.observe(sheet);
        }
      });
    }
    const previousProductId = prevState.selectedProduct?.id ?? null;
    const currentProductId = this.state.selectedProduct?.id ?? null;
    const selectedProductChanged = previousProductId !== currentProductId;
    const variantKey = (variant: any): string | null => {
      if (!variant) return null;
      return String(variant.sku ?? variant.id ?? variant.name ?? '');
    };
    const selectedVariantChanged = variantKey(prevState.selectedVariant)
      !== variantKey(this.state.selectedVariant);

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

          // Update connection line (but NOT in Hero Mode with video / desktop dock)
          if (!this.state.isPivotHeroMode && !this.usesHeroDock()) {
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
      selectedProductChanged ||
      selectedVariantChanged ||
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

          // Reset trim bounds when product changes
          if (selectedProductChanged) {
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
            if (this.state.dialogPosition && !this.state.isPivotHeroMode && !this.usesHeroDock()) {
              const productCenterX = nodeX + nodeW / 2;
              const productCenterY = nodeY + nodeH / 2;

              renderer.dialogConnectionPoint = { x: productCenterX, y: productCenterY };
              renderer.dialogPosition = {
                x: this.state.dialogPosition.x,
                y: this.state.dialogPosition.y + 150
              };
            } else if (this.state.isPivotHeroMode || this.usesHeroDock()) {
              // Clear connection line in Hero Mode / desktop dock
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

              // API payloads can repeat the same storage asset across media
              // roles. A repeated first asset used to enqueue both the hero
              // and an "alternative", wasting a slot and aborting/retrying the
              // exact image the user is waiting for.
              const seenStorageIds = new Set<number>();
              const variantImages = imagesToLoad.filter(image => {
                if (!image.storageId || seenStorageIds.has(image.storageId)) return false;
                seenStorageIds.add(image.storageId);
                return true;
              });

              // The media IDs form the visual identity. Size variants commonly
              // share those IDs and must not cancel/restart the same hero load.
              const mediaIdentity = variantImages.map(image => image.storageId).join('-') || 'none';
              const productGroup = `product-${this.state.selectedProduct.id}-${mediaIdentity}`;
              if (this.selectedMediaGroup !== productGroup) {
                if (this.selectedMediaGroup) this.imageLoadQueue.cancelGroup(this.selectedMediaGroup);
                this.selectedMediaGroup = productGroup;
              }

              // IMMEDIATELY load hero image with HIGHEST priority (priority: 0)
              // This ensures the main selected product image loads BEFORE alternative images
              if (variantImages.length > 0 && variantImages[0].storageId) {
                const heroStorageId = variantImages[0].storageId;
                const selectedProductId = this.state.selectedProduct.id;
                const heroRequestKey = `${selectedProductId}:${heroStorageId}`;
                const heroSrc = buildMediaUrl({
                  storageId: heroStorageId,
                  width: 1300,
                  quality: 85,
                  // Same crop as the grid tile it grows out of. Grid = trim,
                  // hero = untrimmed meant every zoom-in ended with the product
                  // visibly shrinking once the large image landed.
                  trim: true,
                });

                if (this.selectedHeroRequestKey !== heroRequestKey) {
                  if (this.selectedHeroRequestId) this.imageLoadQueue.cancel(this.selectedHeroRequestId);
                  const heroRequestId = `selected-hero-${heroRequestKey}`;
                  this.selectedHeroRequestKey = heroRequestKey;
                  this.selectedHeroRequestId = heroRequestId;
                  renderer.resetSelectedHeroImage();
                  renderer.beginSelectedHeroImageLoad(1300);
                  performance.mark('productfinder-selected-hero-requested', {
                    detail: { productId: selectedProductId, storageId: heroStorageId },
                  });

                  this.imageLoadQueue.add({
                  id: heroRequestId,
                  url: heroSrc,
                  group: `selected-hero-${selectedProductId}`,
                  priority: 0, // HIGHEST PRIORITY - load hero image FIRST!
                  metadata: { storageId: heroStorageId, index: 0, isHero: true }
                }).then(result => {
                  // Use the completed request immediately. Previously this
                  // result was discarded and the centred product stayed on its
                  // 180px grid thumbnail until the independent LOD scan ran.
                  if (
                    this.state.selectedProduct?.id !== selectedProductId
                    || this.selectedHeroRequestKey !== heroRequestKey
                  ) return;
                  this.selectedHeroRequestId = null;
                  renderer.applySelectedHeroImage(result.image, 1300);
                  performance.mark('productfinder-selected-hero-ready', {
                    detail: { productId: selectedProductId, storageId: heroStorageId },
                  });

                  // Fetch trim bounds for text positioning
                  const STORAGE_API_BASE = CENTRAL_STORAGE_BASE;
                  const trimBoundsUrl = `${STORAGE_API_BASE}/storage/media/${heroStorageId}/trim-bounds`;
                  console.log('[App] Fetching trim bounds for storage ID:', heroStorageId, 'URL:', trimBoundsUrl);
                  const trimBoundsRequest: RequestInit = {
                    headers: { 'X-API-Key': CENTRAL_STORAGE_KEY },
                  };
                  fetch(trimBoundsUrl, trimBoundsRequest)
                    .then(async res => {
                      console.log('[App] Trim bounds response status:', res.status);
                      if (!res.ok && res.status !== 404) {
                        throw new Error(`Trim bounds request failed (${res.status})`);
                      }
                      const data = await res.json();
                      console.log('[App] Trim bounds data received:', JSON.stringify(data, null, 2));

                      if (res.status === 404) {
                        console.warn('[App] 404 - Trim bounds not cached yet. Triggering computation...');
                        // Trigger computation by calling with ?generate=true (default is already true, but being explicit)
                        const refreshUrl = `${trimBoundsUrl}?generate=true`;
                        console.log('[App] Fetching with generate=true:', refreshUrl);
                        const refreshRes = await fetch(refreshUrl, trimBoundsRequest);
                        if (!refreshRes.ok) {
                          throw new Error(`Trim bounds generation failed (${refreshRes.status})`);
                        }
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
                  if (
                    this.state.selectedProduct?.id === selectedProductId
                    && this.selectedHeroRequestKey === heroRequestKey
                  ) {
                    renderer.failSelectedHeroImageLoad();
                    this.selectedHeroRequestKey = null;
                    this.selectedHeroRequestId = null;
                  }
                  if (error.error?.message !== 'Request cancelled' && error.error?.message !== 'Request no longer relevant') {
                    console.warn('[App] Failed to load hero image:', heroStorageId, error.error);
                  }
                  });
                }
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
                  trim: true, // same crop as grid tiles and dialog thumbnails
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
              if (this.selectedHeroRequestId) this.imageLoadQueue.cancel(this.selectedHeroRequestId);
              this.selectedHeroRequestKey = null;
              this.selectedHeroRequestId = null;
              renderer.resetSelectedHeroImage();
            }

          renderer.alternativeImages = alternativeImages.length > 0 ? alternativeImages : null;
        } else {
          // No selected product - clear images
          if (this.selectedMediaGroup) this.imageLoadQueue.cancelGroup(this.selectedMediaGroup);
          if (this.selectedHeroRequestId) this.imageLoadQueue.cancel(this.selectedHeroRequestId);
          this.selectedMediaGroup = null;
          this.selectedHeroRequestKey = null;
          this.selectedHeroRequestId = null;
          renderer.alternativeImages = null;
          renderer.resetSelectedHeroImage();
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
        } else if (!this.state.selectedProduct) {
          // No selection in ANY mode: clear. The old "keep in react mode"
          // guard left renderer.selectedProduct set after closing/back —
          // the hero backdrop word kept drawing behind the grid (120551).
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

  /**
   * 1300 px gallery images already fetched for the open card, by storage id.
   * Fed by the background preload below and by handleDialogImageSelect's
   * on-demand loads; read by the card's auto-cycle so it only ever advances
   * to an image that is fully downloaded.
   */
  private heroHiResCache = new Map<number, HTMLImageElement>();

  /** Queue 1300 px loads for the card's gallery (perspectives of the active variant). */
  private preloadDialogGallery = () => {
    const product = this.state.selectedProduct as any;
    if (!product) return;
    const variant = this.state.selectedVariant || getPrimaryVariant(product);
    if (!variant) return;
    if (this.heroHiResCache.size > 80) this.heroHiResCache.clear();
    const images = getImagesForVariant(product, variant).filter(i => i.storageId);
    images.forEach((im, i) => {
      const sid = im.storageId as number;
      if (this.heroHiResCache.has(sid)) return;
      const url = buildMediaUrl({ storageId: sid, width: 1300, quality: 85, trim: true });
      this.imageLoadQueue.add({
        id: `dialog-hires-${sid}`,
        url,
        group: 'dialog-hires',
        priority: 150 + i, // behind the selected hero (0) and alternatives (100+)
      }).then(r => { this.heroHiResCache.set(sid, r.image); }).catch(() => {});
    });
  };

  /** Is the 1300 px version of this gallery image already in memory? */
  private isHiResReady = (storageId: number): boolean => {
    const ready = (i?: HTMLImageElement | null) => !!(i && i.complete && i.naturalWidth > 0);
    if (ready(this.heroHiResCache.get(storageId))) return true;
    const renderer = this.controller.getRenderer();
    return ready(renderer?.alternativeImages?.find(a => a.storageId === storageId)?.loadedImage);
  };

  private handleDialogImageSelect = (storageId: number, thumbnailImage?: HTMLImageElement) => {
    const renderer = this.controller.getRenderer();
    if (!renderer) return;

    // The alternative images are preloaded at 1300 px the moment a product
    // is selected (see the spread-animation loader above). Use that copy:
    // no intermediate state at all for the common case. Before, this handler
    // ignored the cache, showed the 130 px dialog thumbnail stretched to
    // ~900 px and re-fetched the large file (owner report 2026-08-23,
    // storage 120467).
    const preloaded = this.heroHiResCache.get(storageId)
      ?? renderer.alternativeImages?.find(a => a.storageId === storageId)?.loadedImage;
    if (preloaded && preloaded.complete && preloaded.naturalWidth > 0) {
      renderer.selectedVariantHeroImage = preloaded;
      return;
    }

    // Fallback while the large file is still on its way: the thumbnail.
    if (thumbnailImage) {
      renderer.selectedVariantHeroImage = thumbnailImage;
    }

    // Same crop as the thumbnail (trim) — a trimmed 130 px placeholder
    // replaced by an untrimmed 1300 px image made the product visibly
    // shrink when the large one arrived. That jump was the "lame" part.
    const src = buildMediaUrl({ storageId, width: 1300, quality: 85, trim: true });
    const img = new Image();
    img.onload = () => {
      this.heroHiResCache.set(storageId, img);
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
      isPivotHeroMode: this.controller.isPivotHeroMode(),
      heroPosition: this.controller.getHeroPosition(),
    });
    this.maybeAutoOpenSingleHero();
  };

  /**
   * A hero leaf with exactly one product behaves as if that product were
   * already clicked: the card opens by itself (issue #1309). Guarded per
   * breadcrumb path so closing the card does not reopen it; leaving the
   * leaf clears the guard.
   */
  private autoOpenedLeafKey: string | null = null;

  private maybeAutoOpenSingleHero = () => {
    const crumbKey = this.controller.getPivotBreadcrumbs().join('>');
    const order = this.controller.getDisplayOrder();
    // Any path change re-arms the auto-open; only closing the card while
    // STAYING on the leaf keeps it shut.
    if (this.autoOpenedLeafKey && this.autoOpenedLeafKey !== crumbKey) this.autoOpenedLeafKey = null;
    // Auch am Kategorie-Root: EIN Produkt braucht keine Gruppen-Overview —
    // direkt in den Hero mit Karte (owner 2026-08-25, media 120660/120661;
    // der fruehere Root-Guard stammte aus #1309, wo es nur um Drill-Ebenen
    // ging).
    const eligible = this.controller.isPivotHeroMode()
      && order.length === 1;
    if (!eligible) return;
    if (this.autoOpenedLeafKey === crumbKey || this.state.selectedProduct) return;
    this.autoOpenedLeafKey = crumbKey;
    // Let the hero layout settle before centring + docking the card.
    setTimeout(() => {
      if (this.state.selectedProduct) return;
      if (this.controller.getPivotBreadcrumbs().join('>') !== crumbKey) return;
      const only = this.controller.getDisplayOrder()[0];
      if (only) this.openProductDetails(only, { pushHistory: false });
    }, 450);
  };

  private startFPSCounter = () => {
    this.fpsLastSample = performance.now();
    this.fpsFrameCount = 0;
    const tick = (now: number) => {
      this.fpsFrameCount += 1;
      if (now - this.fpsLastSample >= 500) {
        const elapsed = now - this.fpsLastSample;
        const fps = Math.round((this.fpsFrameCount * 1000) / elapsed);
        const zoom = this.controller.getZoom();

        // Only setState when something actually changed — the unconditional
        // 500ms setState re-rendered the whole app shell forever (issue #256).
        const zoomChanged = Math.abs(zoom - this.state.zoom) > 0.01;
        const fpsChanged = fps !== this.state.fps;
        // Hero counter ("01 / 04") follows swipes, which bypass setState.
        const hp = this.state.isPivotHeroMode ? this.controller.getHeroPosition() : null;
        const heroChanged = (hp?.index ?? -1) !== (this.state.heroPosition?.index ?? -1)
          || (hp?.count ?? 0) !== (this.state.heroPosition?.count ?? 0);
        if (zoomChanged && heroChanged) {
          this.setState({ fps, zoom, heroPosition: hp });
        } else if (zoomChanged) {
          this.setState({ fps, zoom });
        } else if (heroChanged) {
          this.setState({ fps, heroPosition: hp });
        } else if (fpsChanged) {
          this.setState({ fps });
        }
        // Desktop hero dock: the card belongs to the product in focus. When a
        // swipe, arrow or dot moves the focus, the open card follows — else
        // it kept showing "BLACK / PINK" next to the orange helmet.
        if (heroChanged) {
          this.syncHeroCardToFocus();
          // Quest-style slide feedback; direction from the index delta.
          // NUR beim echten Durchsteppen (count stabil): ein Ebenenwechsel
          // aendert count und feuerte den Whoosh faelschlich mitten in der
          // Drill-Transition (owner 2026-08-25, 'Audio-Geraeusch').
          const prev = this.state.heroPosition?.index ?? -1;
          const prevCount = this.state.heroPosition?.count ?? -1;
          if (prev >= 0 && hp && hp.count === prevCount && hp.index !== prev) {
            soundService.whoosh(hp.index >= prev ? 1 : -1);
          }
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

    // The root crumb is a persistent Home action, even when it is the
    // currently active (and only) breadcrumb.
    if (index === 0) {
      this.resetToInitialView();
      return;
    }

    if (index === pivotBreadcrumbs.length - 1) return; // current non-root level

    // Close dialog immediately on pivot navigation
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });

    const levelsToRemove = pivotBreadcrumbs.length - 1 - index;
    for (let i = 0; i < levelsToRemove; i++) {
      this.controller.drillUpPivot();
    }
    this.syncPivotUI();
  };

  /**
   * Explorer-Dropdown (owner 2026-08-25): im Breadcrumb direkt auf die
   * Geschwister-Alternative der Ebene wechseln, ohne zurueckzugehen.
   */
  /**
   * Markenwechsel aus dem Breadcrumb-Dropdown (owner 2026-08-25): Sport +
   * Kategorie BLEIBEN in der URL — hat die Ziel-Marke die Kategorie nicht,
   * verwirft das Kategorie-Gate sie automatisch (count==0 -> category=null)
   * und zeigt die passende Auswahl.
   */
  private handleBrandSwitch = (brandName: string) => {
    if (brandName === this.props.brand) return;
    const next = buildBrandUrl(window.location.href, brandName, { clearDependents: false });
    window.history.pushState({ brand: brandName }, '', next);
    window.dispatchEvent(new Event('cataloglocationchange'));
  };

  private handleBreadcrumbSwitch = (index: number, siblingLabel: string) => {
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
    this.controller.switchPivotBreadcrumb(index, siblingLabel);
    this.syncPivotUI();
  };

  /**
   * Pointer-Steuerung der Crumb-Menues: CSS-:hover greift nur, wenn der
   * Browser sich als hover-faehig meldet — der Quest-Browser (Hand-Ray)
   * meldet das je nach Version nicht (owner 2026-08-25). Deshalb oeffnen
   * pointerenter-Events jedes NICHT-Touch-Pointers (mouse/pen/Ray) das
   * Menue zusaetzlich per Klasse; Touch-Taps navigieren weiter direkt.
   */
  private crumbWrapProps() {
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLSpanElement>) => {
        if (e.pointerType !== 'touch') e.currentTarget.classList.add('pf-crumb-open');
      },
      onPointerLeave: (e: React.PointerEvent<HTMLSpanElement>) => {
        e.currentTarget.classList.remove('pf-crumb-open');
      },
    };
  }

  /** Hover-Menue eines Breadcrumbs (Desktop; Touch hat kein Hover). */
  private renderCrumbMenu(items: Array<{ label: string; active: boolean; onSelect: () => void }>): React.ReactNode {
    if (items.length < 2) return null;
    return (
      <div className="pf-crumb-menu" role="menu">
        {items.map(item => (
          <button
            type="button"
            role="menuitem"
            key={item.label}
            className={`pf-crumb-menu-item ${item.active ? 'active' : ''}`}
            onClick={item.onSelect}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  /**
   * Header trail: the entry category IS the pivot root, so the former
   * "Alle" crumb is gone (it sat mid-trail and read like a level of its
   * own). Drilled in → the category crumb returns to the category's
   * overview; at the root → it opens the category selection.
   */
  /**
   * Closing the card: on the phone the tap had zoomed the product into the
   * band above the sheet — zoom back out to the fitted overview, else the
   * stage stayed stuck at the top with a white gap below (120528).
   */
  private handleProductDialogClose = () => {
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
    if (this.isMobileLayout()) {
      const vt = this.controller.getViewportTransform();
      // Scale 1 = the grid's own CSS-pixel layout; the clamp centres a
      // short grid and top-aligns a long one.
      vt?.setPosition(0, 0, 1);
    }
  };

  /**
   * Breadcrumb semantics (issue #1311): a crumb goes to ITS page — the one
   * you saw after choosing it. O'Neal -> sport selection, MOTO -> category
   * selection, MX HELMETS -> this category's pivot root. Clicking the
   * category crumb never opens the selection list (that is MOTO's page).
   */
  private handleCategoryCrumbClick = () => {
    if (this.state.pivotBreadcrumbs.length > 1) {
      this.handleBreadcrumbClick(0);
      return;
    }
    // Bereits am Kategorie-Root: Klick faehrt nur die Kamera in die
    // Startposition zurueck (owner 2026-08-25, media 120645) — offene
    // Karte schliessen, Hero-Praesentation verlassen, Viewport reset.
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
    this.controller.exitHeroPresentation();
    this.controller.resetViewport();
    this.controller.handleResize();
  };

  private resetToInitialView = () => {
    const initialState = createInitialState();
    this.controller.clearAiFilterProductIds();
    this.controller.resetPivot();
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
      searchFilterTerm: null,
      footerSearchTerm: '',
      mobilePivotOpen: false,
      cartPanelOpen: false,
    }, () => this.syncPivotUI());
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
    // History entry comes from controller.drillDownGroup - pushing here too
    // meant TWO entries per drill and back only undid half a step.
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
    const all = this.controller.getCatalogAllProducts();
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
    // Matrix-Pane (owner 2026-08-26): bis zu 60 Kacheln statt 8 Zeilen.
    return this.searchAllProducts(term, 60);
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
    const total = this.controller.getCatalogAllProducts().length;
    console.log('[searchFilter] term=', trimmed, 'matches=', matches.length, '/', total);
    if (matches.length === 0 || matches.length === total) {
      console.warn('[searchFilter] no-op — matches everything or nothing');
      return;
    }
    // GLOBAL: the working set becomes the matches across the whole catalog
    // — the category gate no longer caps the search (owner 2026-08-24).
    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
    this.controller.setGlobalSearchProducts(matches);
    this.setState({
      searchFilterTerm: trimmed,
      footerSearchTerm: '',
    }, () => this.syncPivotUI());
  };

  private clearSearchFilter = () => {
    this.controller.setGlobalSearchProducts(null);
    this.setState({ searchFilterTerm: null }, () => this.syncPivotUI());
  };

  private handleFooterSearchSelect = (productId: string) => {
    const inCategory =
      this.controller.getAllProducts().find((p) => p.id === productId) ||
      this.state.filteredProducts.find((p) => p.id === productId) ||
      this.controller.getDisplayOrder().find((p) => p.id === productId);
    if (inCategory) {
      this.openProductDetails(inCategory);
      this.setState({ footerSearchTerm: '' });
      return;
    }
    // Outside the current category: switch to global search mode with the
    // current term, then select the product in the new view.
    const global = this.controller.getCatalogAllProducts().find((p) => p.id === productId);
    if (!global) return;
    const term = this.state.footerSearchTerm.trim() || global.name;
    const matches = this.searchAllProducts(term, 0);
    this.controller.setGlobalSearchProducts(matches.length ? matches : [global]);
    this.setState({ searchFilterTerm: term, footerSearchTerm: '' }, () => {
      this.syncPivotUI();
      setTimeout(() => {
        const target = this.controller.getDisplayOrder().find((p) => p.id === productId);
        if (target) this.openProductDetails(target, { pushHistory: false });
      }, 600);
    });
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
    size?: string;
    availableSizes?: string[];
  }) => {
    const delta = payload.quantity ?? 1;
    if (delta === 0) return;
    const variantKey = this.getVariantKeyFromPayload(payload);
    const itemId = `${payload.product.id}-${variantKey}`;

    this.setState((prev) => {
      const existingIndex = prev.cartItems.findIndex(item => item.id === itemId);
      let cartItems = [...prev.cartItems];

      // Helmet sizes carry head circumference ("XS (53/54)") — as matrix
      // column keys that made six extra-wide, alphabetically sorted columns
      // (issue #1312). The bracket part is display detail, not a size key.
      const cleanSize = (x: string) => x.replace(/\s*\(.*\)\s*$/, '').trim();
      const chosenSize = cleanSize(payload.size
        || payload.variant?.size || payload.variant?.option2
        || payload.availableSizes?.[0] || 'One Size');

      if (existingIndex >= 0) {
        const existing = cartItems[existingIndex];
        const sizes = { ...(existing.sizes || {}) };
        const nextSizeQty = (sizes[chosenSize] || 0) + delta;
        if (nextSizeQty <= 0) delete sizes[chosenSize];
        else sizes[chosenSize] = nextSizeQty;
        const newQuantity = Object.values(sizes).reduce((sum, q) => sum + (q || 0), 0);
        if (newQuantity <= 0) {
          cartItems.splice(existingIndex, 1);
        } else {
          cartItems[existingIndex] = { ...existing, sizes, quantity: newQuantity };
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
          availableSizes: Array.from(new Set((payload.availableSizes?.length
            ? payload.availableSizes
            : (sizes.length > 0 ? sizes : [chosenSize])).map(cleanSize))),
          // Quantity lives in the size matrix — an empty map rendered as
          // "1 Position · 0 Stk." with a dead 0 cell (issue #1303).
          sizes: { [chosenSize]: delta },
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

  private handleCartUploadB2B = async () => {
    if (this.state.orderSubmitting) return;
    const items = this.state.cartItems.flatMap(item => {
      const price = item.priceText ? parseFloat(item.priceText.replace(/[^0-9.,]/g, '').replace(',', '.')) : undefined;
      const base = {
        product_id: item.productId,
        product_code: item.articleNumber || undefined,
        product_name: item.name,
        color: item.color || item.variantLabel || undefined,
        price_gross: Number.isFinite(price) ? price : undefined,
      };
      const sizeEntries = Object.entries(item.sizes || {}).filter(([, q]) => (q || 0) > 0);
      if (sizeEntries.length > 0) {
        return sizeEntries.map(([size, qty]) => ({ ...base, size, quantity: qty as number }));
      }
      return item.quantity > 0 ? [{ ...base, quantity: item.quantity }] : [];
    });
    if (items.length === 0) return;

    this.setState({ orderSubmitting: true, orderResult: null, orderError: null });
    try {
      const result = await submitOrder({ items });
      // Success: clear the cart, keep the confirmation visible
      this.setState({ orderSubmitting: false, orderResult: result.order_number, cartItems: [] });
    } catch (e: any) {
      this.setState({ orderSubmitting: false, orderError: String(e?.message || e) });
    }
  };

  private toCartViewItems = (): CartViewItem[] => {
    const cleanSize = (x: string) => x.replace(/\s*\(.*\)\s*$/, '').trim();
    const cleanSizes = (m: Record<string, number> | undefined) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(m || {})) {
        const key = cleanSize(k);
        out[key] = (out[key] || 0) + (v || 0);
      }
      return out;
    };
    return this.state.cartItems.map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.name,
      productImageUrl: item.imageUrl,
      articleNumber: item.articleNumber || '',
      color: item.color || item.variantLabel || '',
      availableColors: item.availableColors || [item.color || ''],
      availableSizes: Array.from(new Set((item.availableSizes || ['One Size']).map(cleanSize))),
      sizes: Object.keys(item.sizes || {}).length
        ? cleanSizes(item.sizes)
        : (item.quantity > 0 ? { [cleanSize(item.availableSizes?.[0] || 'One Size')]: item.quantity } : {}),
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
    // Bring the product into view as well — a card that changes while the
    // stage stays put is exactly what made the old arrows feel broken.
    if (!this.state.isPivotHeroMode || this.controller.isHeroRootOverview()) this.controller.centerOnProduct(nextProduct);
    soundService.whoosh(delta >= 0 ? 1 : -1);
  };

  /**
   * Desktop hero dock: keep the open card on the product in focus. Called
   * after every focus move (arrow, dot, swipe via the FPS tick). Silently
   * does nothing when no card is open or the focus did not change.
   */
  private syncHeroCardToFocus = () => {
    if (!this.state.isPivotHeroMode || !this.state.selectedProduct) return;
    if (this.controller.isHeroRootOverview()) return;
    const hp = this.controller.getHeroPosition();
    if (!hp) return;
    const focused = this.controller.getHeroProductAt(hp.index);
    if (focused && focused.id !== this.state.selectedProduct.id) {
      this.setState({ selectedProduct: focused, selectedVariant: null, heroPosition: hp });
    }
  };

  private openProductDetails(product: Product, options: { pushHistory?: boolean } = {}) {
    const tapStage = resolveProductTapStage(this.state.selectedProduct?.id, product.id);
    const primaryVariant = getPrimaryVariant(product);
    // Establish selection ownership before the camera movement can trigger the
    // periodic LOD scan. Otherwise that scan may start a duplicate 1300px load.
    const renderer = this.controller.getRenderer();
    if (renderer) {
      renderer.selectedProduct = product;
      const heroStorageId = primaryVariant
        ? getImagesForVariant(product, primaryVariant)[0]?.storageId
        : undefined;
      if (heroStorageId) renderer.beginSelectedHeroImageLoad(1300);
    }
    this.controller.centerOnProduct(product);

    // Sibling sequence for the card's prev/next: the column the product
    // sits in, in display order. Was never set on the mouse path, which
    // left the old arrows dead (selectedIndex -1).
    const groupKey = this.controller.getGroupKeyForProduct(product);
    // Category-root overview: the siblings are ALL products of the
    // category, not just the colour group — else the arrows counted 01/02
    // inside a 22-product overview.
    const sequence = (this.controller.isHeroRootOverview() || this.controller.isPivotHeroMode()
      ? this.controller.getDisplayOrder()
      : this.controller.getDisplayOrderForGroup(groupKey)).map(p => p.id);
    const seqIndex = sequence.indexOf(product.id);

    if (!this.state.selectedProduct) soundService.pop();

    this.setState({
      selectedProduct: product,
      selectedVariant: primaryVariant,
      shouldShowV4Dialog: tapStage === 'detail',
      modalSequence: sequence,
      selectedIndex: seqIndex,
      modalDirection: 0,
    });

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

    if (options.pushHistory !== false && tapStage === 'preview') {
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

    // Grouped-View: Klick auf einen Poster-Header drillt in die Gruppe
    if (this.controller.handlePosterHeaderClick(x, y)) {
      this.syncPivotUI();
      return;
    }

    // Otherwise check for product click
    const product = this.controller.hitTest(x, y);
    if (product) {
      // Grouped-View: Produkt-Klick = Filter auf seine Gruppe (Pivot-Action,
      // media 120646) — erst wenn die Ebene nicht weiter splittet, oeffnet
      // der Klick das Produkt selbst.
      if (this.controller.isHeroRootOverview() && this.controller.drillIntoProductGroup(product)) {
        this.syncPivotUI();
        return;
      }
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

    // Grouped-View: Klick auf einen Poster-Header drillt in die Gruppe
    if (this.controller.handlePosterHeaderClick(x, y)) {
      this.syncPivotUI();
      return;
    }

    // Otherwise check for product click
    const product = this.controller.hitTest(x, y);
    if (product) {
      this.openProductDetails(product);
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

  private handleRealtimeDemoHotkey = (event: KeyboardEvent) => {
    if (!this.props.realtimeDemoAvailable
      || !event.ctrlKey
      || !event.shiftKey
      || event.key.toLowerCase() !== 'v') return;
    event.preventDefault();
    this.setState(prev => ({
      realtimeShortcutEnabled: !prev.realtimeShortcutEnabled,
    }));
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
    const getDimensionLabel = (dim: GroupDimension) => {
      if (dim === '__taxonomy__') return 'Category';
      return pivotDefinitions.find(d => d.key === dim)?.label ?? dim;
    };
    const footerSearchResults = this.filterFooterSearchResults(footerSearchTerm);

    // Storage URLs from environment
    const STORAGE_API_BASE = CENTRAL_STORAGE_BASE;
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
              <span
                role="button"
                tabIndex={0}
                className="pf-header-breadcrumb pf-catalog-breadcrumb"
                onClick={this.props.onRequestCatalogLanding}
                onKeyDown={evt => {
                  if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    this.props.onRequestCatalogLanding();
                  }
                }}
              >
                Catalog {this.props.catalogYear}
              </span>
              {/* Flow-Varianten: übersprungene Gate-Stufen erscheinen nicht als Crumb */}
              {this.props.brand && <>
              <span className="pf-header-breadcrumb-sep">›</span>
              <span className="pf-crumb-wrap" {...this.crumbWrapProps()}>
              <span
                role={this.props.canChangeBrand ? 'button' : undefined}
                tabIndex={this.props.canChangeBrand ? 0 : -1}
                className={`pf-header-breadcrumb pf-brand-breadcrumb ${this.props.canChangeBrand ? 'changeable' : ''}`}
                onClick={this.props.onRequestSportSelection}
                onKeyDown={evt => {
                  if (this.props.canChangeBrand && (evt.key === 'Enter' || evt.key === ' ')) {
                    evt.preventDefault();
                    this.props.onRequestSportSelection();
                  }
                }}
                title={this.props.canChangeBrand ? 'Change brand' : `Brand: ${this.props.brand}`}
              >
                {this.props.brand}
              </span>
              {this.renderCrumbMenu(this.state.availableBrands.map(item => ({
                label: item.name,
                active: item.name === this.props.brand,
                // Aktive Marke: wie ueberall Kamera-Reset; andere: Marke im
                // KONTEXT wechseln (Sport+Kategorie bleiben, Gate faellt bei
                // leerer Kategorie automatisch zurueck).
                onSelect: item.name === this.props.brand
                  ? this.handleCategoryCrumbClick
                  : () => this.handleBrandSwitch(item.name),
              })))}
              </span>
              </>}
              {this.props.sportLabel && !this.controller.isGlobalSearchActive() && <>
              <span className="pf-header-breadcrumb-sep">›</span>
              <span className="pf-crumb-wrap" {...this.crumbWrapProps()}>
              <span
                role="button"
                tabIndex={0}
                className="pf-header-breadcrumb pf-catalog-breadcrumb"
                onClick={this.props.onRequestCategorySelection}
                onKeyDown={evt => {
                  if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    this.props.onRequestCategorySelection();
                  }
                }}
              >
                {this.props.sportLabel}
              </span>
              {this.renderCrumbMenu(CATALOG_ENTRY_CONFIG.sports.filter(item => item.enabled).map(item => ({
                label: getLocalizedLabel(item.labels, this.props.locale),
                active: item.id === this.props.entrySelection?.sportId,
                // Aktiver Eintrag = Kamera zurueck in die Startposition
                onSelect: item.id === this.props.entrySelection?.sportId
                  ? this.handleCategoryCrumbClick
                  : () => writeCatalogUrl({ sport: item.id, category: null }),
              })))}
              </span>
              </>}
              {this.props.categoryLabel && !this.controller.isGlobalSearchActive() && <>
              <span className="pf-header-breadcrumb-sep">›</span>
              <span className="pf-crumb-wrap" {...this.crumbWrapProps()}>
              <span
                role="button"
                tabIndex={0}
                className="pf-header-breadcrumb pf-catalog-breadcrumb"
                onClick={this.handleCategoryCrumbClick}
                onKeyDown={evt => {
                  if (evt.key === 'Enter' || evt.key === ' ') {
                    evt.preventDefault();
                    this.handleCategoryCrumbClick();
                  }
                }}
              >
                {this.props.categoryLabel}
              </span>
              {this.renderCrumbMenu((CATALOG_ENTRY_CONFIG.categoriesBySport[this.props.entrySelection?.sportId ?? ''] ?? []).map(item => ({
                label: getLocalizedLabel(item.labels, this.props.locale),
                active: item.id === this.props.entrySelection?.categoryId,
                // Aktiver Eintrag = Kamera zurueck in die Startposition
                onSelect: item.id === this.props.entrySelection?.categoryId
                  ? this.handleCategoryCrumbClick
                  : () => writeCatalogUrl({ category: item.id }),
              })))}
              </span>
              </>}
              {this.controller.isGlobalSearchActive() && <>
              <span className="pf-header-breadcrumb-sep">›</span>
              <span
                role="button"
                tabIndex={0}
                className="pf-header-breadcrumb pf-catalog-breadcrumb"
                title="Suche über den gesamten Katalog — Klick beendet die Suche"
                onClick={this.clearSearchFilter}
                onKeyDown={evt => { if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); this.clearSearchFilter(); } }}
              >
                Alle Produkte
              </span>
              </>}
              {(() => { const crumbSiblings = this.controller.getPivotBreadcrumbSiblings();
              return pivotBreadcrumbs.slice(1).map((crumb, j) => { const i = j + 1;
                const rawSiblings = crumbSiblings[i] ?? [];
                return (
                <React.Fragment key={`header-${crumb}-${i}`}>
                  <span className="pf-header-breadcrumb-sep">›</span>
                  <span className="pf-crumb-wrap" {...this.crumbWrapProps()}>
                  <span
                    role="button"
                    tabIndex={i === 0 || i < pivotBreadcrumbs.length - 1 ? 0 : -1}
                    className={`pf-header-breadcrumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''} ${i === 0 ? 'home' : ''}`}
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
                  {this.renderCrumbMenu(rawSiblings.map(label => ({
                    label,
                    active: label === (this.controller.getPivotBreadcrumbs()[i] ?? crumb),
                    onSelect: () => this.handleBreadcrumbSwitch(i, label),
                  })))}
                  </span>
                </React.Fragment>
              ); }); })()}
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
              <svg className="pf-header-search-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
              <input
                type="text"
                className="pf-header-search-input"
                placeholder="Search products…"
                value={footerSearchTerm}
                onChange={(e) => this.handleFooterSearchChange(e.target.value)}
                onKeyDown={this.handleFooterSearchKeyDown}
              />
              {footerSearchTerm.trim().length > 0 && createPortal((() => {
                // Suchergebnis als MATRIX ueber die volle Seitenbreite (owner
                // 2026-08-26): Bild + Name + Preis pro Kachel, unter dem
                // Header, statt einer schmalen 8-Zeilen-Liste. Portal, weil
                // backdrop-filter im Header ein fixed-Element einfangen wuerde.
                const header = typeof document !== 'undefined' ? document.querySelector('.pf-header') : null;
                const top = header ? Math.round(header.getBoundingClientRect().bottom) + 8 : 64;
                const total = this.searchAllProducts(footerSearchTerm, 0).length;
                return (
                  <div className="pf-search-panel" style={{ top }} role="dialog" aria-label="Suchergebnis">
                    <div className="pf-search-panel-head">
                      <span className="pf-search-panel-title">
                        {total === 0 ? 'Keine Treffer' : `${total} Treffer`}
                        {total > footerSearchResults.length && <span className="pf-search-panel-sub"> · erste {footerSearchResults.length}</span>}
                        <span className="pf-search-panel-term"> für „{footerSearchTerm.trim()}"</span>
                      </span>
                      <div className="pf-search-panel-actions">
                        {total > 0 && (
                          <button type="button" className="pf-search-panel-apply" onClick={() => this.applySearchFilter(footerSearchTerm)} title="Alle Treffer im Finder anzeigen (Shift+Enter)">
                            Alle {total} im Finder zeigen
                          </button>
                        )}
                        <button type="button" className="pf-search-panel-close" onClick={() => this.setState({ footerSearchTerm: '' })} aria-label="Schließen">×</button>
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="pf-search-panel-grid">
                        {footerSearchResults.map((product) => (
                          <button
                            type="button"
                            key={`search-tile-${product.id}`}
                            className="pf-search-tile"
                            onClick={() => this.handleFooterSearchSelect(product.id)}
                            title={product.name}
                          >
                            <span className="pf-search-tile-img"><img src={product.imageUrl} alt="" loading="lazy" /></span>
                            <span className="pf-search-tile-cat">{(product as any).raw?.properties?.product_type || (product as any).raw?.category || ''}</span>
                            <span className="pf-search-tile-name">{product.name}</span>
                            {product.price?.formatted && <span className="pf-search-tile-price">{product.price.formatted}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })(), document.body)}
            </div>
          </div>
          <div className="pf-header-actions">
            {(layoutMode === 'pivot' || layoutMode === 'lanes') && (
              <>
                <div className="pf-header-select-group">
                  <CustomSelect
                    className="pf-header-select pf-header-dimension-select"
                    value={pivotDimension}
                    onChange={(value) => this.handleDimensionClick(value as GroupDimension)}
                    options={[
                      ...(!pivotDimensions
                        .filter(dim => availableDimsNow.includes(dim))
                        .includes(pivotDimension)
                        ? [{ value: pivotDimension, label: getDimensionLabel(pivotDimension) }]
                        : []),
                      ...pivotDimensions
                        .filter(dim => availableDimsNow.includes(dim))
                        .map(dim => ({ value: dim, label: getDimensionLabel(dim) })),
                    ]}
                  />
                </div>
                <div className="pf-header-select-group">
                  <CustomSelect
                    className="pf-header-select pf-header-sort-select"
                    value={sortMode}
                    onChange={(value) => this.setState({
                      sortMode: value as SortMode,
                      selectedProduct: null,
                      selectedVariant: null,
                      dialogPosition: null,
                      shouldShowV4Dialog: false,
                    })}
                    options={[
                      // Without the "SORT" caption the field must name itself
                      { value: 'none', label: 'Sort' },
                      { value: 'name-asc', label: 'Name ↑' },
                      { value: 'name-desc', label: 'Name ↓' },
                      { value: 'price-asc', label: 'Price ↑' },
                      { value: 'price-desc', label: 'Price ↓' },
                      { value: 'weight-asc', label: 'Weight ↑' },
                      { value: 'weight-desc', label: 'Weight ↓' },
                      { value: 'color-asc', label: 'Color ↑' },
                      { value: 'color-desc', label: 'Color ↓' },
                    ]}
                  />
                </div>
              </>
            )}
            {(() => { const grouped = this.controller.isHeroRootOverview();
            return (
            <div className="pf-view-switch" role="group" aria-label="Ansicht">
              <button
                type="button"
                className={`pf-header-btn ${!grouped ? 'active' : ''}`}
                disabled={grouped && !this.controller.canShowPivotColumns()}
                onClick={() => {
                  if (grouped) {
                    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
                    this.controller.exitHeroPresentation();
                    this.controller.setViewOverride('pivot');
                    this.syncPivotUI();
                  }
                }}
                title="Pivot-Spalten"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 20V9M12 20V4M19 20v-7"/><path d="M3 20h18"/>
                </svg>
              </button>
              <button
                type="button"
                className={`pf-header-btn ${grouped ? 'active' : ''}`}
                onClick={() => {
                  if (!grouped) {
                    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false });
                    this.controller.exitHeroPresentation();
                    this.controller.setViewOverride('grouped');
                    this.syncPivotUI();
                  }
                }}
                title="Grouped View"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>
                </svg>
              </button>
            </div>
            ); })()}
            {/* Desktop: the right pane is gone (owner, 2026-08-23 — it only took
                space; back is the breadcrumb, dimension/sort already live here).
                Its two functions move up: AI search and the cart. */}
            {!this.isMobileLayout() && (
              <>
                <button
                  type="button"
                  className="pf-header-btn pf-header-ai-btn"
                  onClick={() => this.setState({ isQuickSearchOpen: true })}
                  title="Ask AI"
                >
                  Ask AI
                </button>
                <button
                  type="button"
                  className={`pf-header-btn pf-header-cart-btn ${cartItems.length ? 'has-items' : ''}`}
                  onClick={() => this.setState({ cartPanelOpen: true })}
                  title={cartItems.length ? `${cartItems.length} ${cartItems.length === 1 ? 'Position' : 'Positionen'}` : 'Warenkorb leer'}
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
                  {cartItems.length > 0 && <span className="pf-header-cart-count">{cartItems.length}</span>}
                </button>
              </>
            )}
          </div>
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

        {/* Mobile: breadcrumbs get their own row so the primary header stays usable. */}
        <nav className="pf-mobile-breadcrumb-row" aria-label="Product navigation">
          <div className="pf-mobile-breadcrumb-scroll">
            <span
              role="button"
              tabIndex={0}
              className="pf-header-breadcrumb pf-catalog-breadcrumb"
              onClick={this.props.onRequestCatalogLanding}
              onKeyDown={evt => {
                if (evt.key === 'Enter' || evt.key === ' ') {
                  evt.preventDefault();
                  this.props.onRequestCatalogLanding();
                }
              }}
            >
              Catalog {this.props.catalogYear}
            </span>
            {this.props.brand && <>
            <span className="pf-header-breadcrumb-sep">›</span>
            <span
              role={this.props.canChangeBrand ? 'button' : undefined}
              tabIndex={this.props.canChangeBrand ? 0 : -1}
              className={`pf-header-breadcrumb pf-brand-breadcrumb ${this.props.canChangeBrand ? 'changeable' : ''}`}
              onClick={this.props.onRequestSportSelection}
              onKeyDown={evt => {
                if (this.props.canChangeBrand && (evt.key === 'Enter' || evt.key === ' ')) {
                  evt.preventDefault();
                  this.props.onRequestSportSelection();
                }
              }}
            >
              {this.props.brand}
            </span>
            </>}
            {this.props.sportLabel && !this.controller.isGlobalSearchActive() && <>
            <span className="pf-header-breadcrumb-sep">›</span>
            <span
              role="button"
              tabIndex={0}
              className="pf-header-breadcrumb pf-catalog-breadcrumb"
              onClick={this.props.onRequestCategorySelection}
              onKeyDown={evt => {
                if (evt.key === 'Enter' || evt.key === ' ') {
                  evt.preventDefault();
                  this.props.onRequestCategorySelection();
                }
              }}
            >
              {this.props.sportLabel}
            </span>
            </>}
            {this.props.categoryLabel && !this.controller.isGlobalSearchActive() && <>
            <span className="pf-header-breadcrumb-sep">›</span>
            <span
              role="button"
              tabIndex={0}
              className="pf-header-breadcrumb pf-catalog-breadcrumb"
              onClick={this.handleCategoryCrumbClick}
              onKeyDown={evt => {
                if (evt.key === 'Enter' || evt.key === ' ') {
                  evt.preventDefault();
                  this.handleCategoryCrumbClick();
                }
              }}
            >
              {this.props.categoryLabel}
            </span>
            </>}
            {this.controller.isGlobalSearchActive() && <>
            <span className="pf-header-breadcrumb-sep">›</span>
            <span role="button" tabIndex={0} className="pf-header-breadcrumb pf-catalog-breadcrumb" onClick={this.clearSearchFilter}>Alle Produkte</span>
            </>}
            {pivotBreadcrumbs.slice(1).map((crumb, j) => { const i = j + 1; return (
              <React.Fragment key={`mobile-header-${crumb}-${i}`}>
                <span className="pf-header-breadcrumb-sep">›</span>
                <span
                  role="button"
                  tabIndex={i === 0 || i < pivotBreadcrumbs.length - 1 ? 0 : -1}
                  className={`pf-header-breadcrumb ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''} ${i === 0 ? 'home' : ''}`}
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
            ); })}
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
        </nav>

        {/* Mobile Pivot Overlay */}
        {this.state.mobilePivotOpen && (
          <div className="pf-mobile-pivot-overlay">
            <div className="pf-mobile-pivot-header">
              <span>Menu</span>
              <button type="button" className="pf-mobile-search-close" onClick={() => this.setState({ mobilePivotOpen: false })}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Ansicht: gleicher Pivot/Grouped-Switch wie der Desktop-Header
                (owner 2026-08-25, media 120666 — Handy und Desktop sollen
                dieselben Optionen bieten; Family-Grouping- und Lanes-Buttons
                sind wie am Desktop entfallen). */}
            <div className="pf-mobile-pivot-label">Ansicht</div>
            <div className="pf-mobile-pivot-dims" style={{ marginBottom: 20 }}>
              {(() => { const grouped = this.controller.isHeroRootOverview() || this.controller.isPivotHeroMode();
              return (<>
              <button type="button" className={`pf-mobile-pivot-dim ${!grouped ? 'active' : ''}`}
                disabled={grouped && !this.controller.canShowPivotColumns()}
                onClick={() => {
                  if (grouped) {
                    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false, mobilePivotOpen: false });
                    this.controller.exitHeroPresentation();
                    this.controller.setViewOverride('pivot');
                    this.syncPivotUI();
                  }
                }}>
                <i className="fa-solid fa-chart-column" style={{ marginRight: 6 }}></i>Pivot-Spalten
              </button>
              <button type="button" className={`pf-mobile-pivot-dim ${grouped ? 'active' : ''}`}
                onClick={() => {
                  if (!grouped) {
                    this.setState({ selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false, mobilePivotOpen: false });
                    this.controller.exitHeroPresentation();
                    this.controller.setViewOverride('grouped');
                    this.syncPivotUI();
                  }
                }}>
                <i className="fa-solid fa-grip" style={{ marginRight: 6 }}></i>Grouped View
              </button>
              </>); })()}
            </div>

            {/* Sortierung: gleiche Optionen wie das Desktop-SORT-Dropdown */}
            <div className="pf-mobile-pivot-label">Sortierung</div>
            <div className="pf-mobile-pivot-dims" style={{ marginBottom: 20 }}>
              {([
                ['none', 'Standard'],
                ['name-asc', 'Name ↑'], ['name-desc', 'Name ↓'],
                ['price-asc', 'Price ↑'], ['price-desc', 'Price ↓'],
                ['weight-asc', 'Weight ↑'], ['weight-desc', 'Weight ↓'],
                ['color-asc', 'Color ↑'], ['color-desc', 'Color ↓'],
              ] as Array<[SortMode, string]>).map(([value, label]) => (
                <button type="button" key={`mobile-sort-${value}`}
                  className={`pf-mobile-pivot-dim ${this.state.sortMode === value ? 'active' : ''}`}
                  onClick={() => this.setState({ sortMode: value, selectedProduct: null, selectedVariant: null, dialogPosition: null, shouldShowV4Dialog: false })}>
                  {label}
                </button>
              ))}
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

        <div className={`pf-stage pf-stage-${this.state.footerPosition} ${selectedProduct ? 'pf-stage-card-open' : ''}`}>
          {this.useArcturianRenderer() ? (
            <Suspense fallback={<div className="pf-canvas" style={{ background: '#fff' }} />}>
              <ArcturianRendererComponent
                getNodes={() => this.controller.getLayoutEngine()?.all() ?? []}
                getViewport={() => this.controller.getViewportTransform()}
                getSize={() => {
                  // The input canvas itself, not the stage: CSS insets (e.g. the
                  // 300 px sidebar) shrink the canvas but not its parent, and
                  // the layout + viewport are computed for the canvas box.
                  const el = this.canvasRef.current;
                  return { width: el?.clientWidth || window.innerWidth, height: el?.clientHeight || window.innerHeight };
                }}
              />
            </Suspense>
          ) : null}
          {/* GPU mode: this canvas stays full-size and ON TOP. It is the input
              surface (pinch, drag, click, hit-testing), the layout measures
              itself by its clientWidth/Height, and it still draws the pivot
              headers, hover and selection. Only the product images move to
              the WebGL layer beneath, which mirrors this canvas' transform. */}
          <canvas ref={this.canvasRef} className="pf-canvas" style={this.useArcturianRenderer() ? { zIndex: 2, background: 'transparent' } : undefined} />
          {/* White fade under the docked card (issue #1307). Lives INSIDE
              .pf-stage: the stage is a stacking context (z-index: 0), so an
              outside overlay would cover the hero arrows no matter their
              z-index (media 120610) — inside, canvas < scrim < arrows works. */}
          {this.usesHeroDock() && selectedProduct && !this.state.shouldShowV4Dialog && (
            <div className="pf-hero-dock-scrim" aria-hidden="true" />
          )}
          {/* Hero mode on phones: previous/next arrows. Swiping works too, but
              a flick between bildfüllend products is easy to overshoot; the
              arrows share the snap targets with the swipe (stepHeroProduct). */}
          {this.state.isPivotHeroMode && (!this.isMobileLayout() || this.state.selectedProduct)
            && !this.controller.isHeroRootOverview()
            && (this.state.heroPosition?.count ?? this.controller.getDisplayOrder().length) > 1 && (
            <>
              <button type="button" className="pf-hero-arrow pf-hero-arrow-prev" aria-label="Vorheriges Produkt"
                onClick={() => { this.controller.stepHeroProduct(-1); this.setState({ heroPosition: this.controller.getHeroPosition() }, this.syncHeroCardToFocus); }}>‹</button>
              <button type="button" className="pf-hero-arrow pf-hero-arrow-next" aria-label="Nächstes Produkt"
                onClick={() => { this.controller.stepHeroProduct(1); this.setState({ heroPosition: this.controller.getHeroPosition() }, this.syncHeroCardToFocus); }}>›</button>
              {/* "01 / 04" — position within the hero row, desktop only; the
                  phone has no room below the product for it. */}
              {!this.isMobileLayout() && this.state.heroPosition && (
                <>
                  {/* Footer as in the design reference (storage 120473): the
                      counter bottom-left under the arrow, the dots centred. */}
                  <div className="pf-hero-counter" aria-live="polite">
                    <b>{String(this.state.heroPosition.index + 1).padStart(2, '0')}</b>
                    <span> / {String(this.state.heroPosition.count).padStart(2, '0')}</span>
                  </div>
                  {this.state.heroPosition.count > 1 && this.state.heroPosition.count <= 12 && (
                    <div className="pf-hero-dots" aria-hidden="true">
                      {Array.from({ length: this.state.heroPosition.count }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`pf-hero-dot ${i === this.state.heroPosition!.index ? 'active' : ''}`}
                          onClick={() => {
                            const cur = this.state.heroPosition!.index;
                            const steps = i - cur;
                            for (let k = 0; k < Math.abs(steps); k++) this.controller.stepHeroProduct(steps > 0 ? 1 : -1);
                            this.setState({ heroPosition: this.controller.getHeroPosition() }, this.syncHeroCardToFocus);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Sibling navigation while a card is docked outside hero mode
              (pivot grid). Same footer arrows as the hero presentation; the
              old centre-right squares only swapped the card content without
              moving the viewport, which read as broken. In hero mode the
              hero arrows above already cover this. */}
          {selectedProduct && (!this.state.isPivotHeroMode || this.controller.isHeroRootOverview()) && this.state.modalSequence.length > 1 && (
            <>
              <button type="button" className="pf-hero-arrow pf-hero-arrow-prev" aria-label="Vorheriges Produkt"
                disabled={this.state.selectedIndex <= 0}
                onClick={() => this.showRelativeProduct(-1)}>‹</button>
              <button type="button" className="pf-hero-arrow pf-hero-arrow-next" aria-label="Nächstes Produkt"
                disabled={this.state.selectedIndex >= this.state.modalSequence.length - 1}
                onClick={() => this.showRelativeProduct(1)}>›</button>
              {!this.isMobileLayout() && (
                <div className="pf-hero-counter">
                  {String(this.state.selectedIndex + 1).padStart(2, '0')} / {String(this.state.modalSequence.length).padStart(2, '0')}
                </div>
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
                canvasWidth={canvas.clientWidth}
                canvasHeight={canvas.clientHeight}
                viewportScale={viewport.getTargetScale()}
                viewportOffsetX={viewport.getTargetOffset().x}
                viewportOffsetY={viewport.getTargetOffset().y}
                forceConfig={this.state.devSettings.forceLabelsConfig}
              />
            );
          })()}
        </div>

        {/* Desktop: no side pane (owner, 2026-08-23). Its functions sit in
            the header (Ask AI, cart) and the breadcrumbs (back/reset). With
            no footer element mounted, handleResize leaves the canvas inset
            at 0 and the grid gets the full width. Phones keep the bottom bar. */}
        {this.isMobileLayout() && <div
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
                  this.resetToInitialView();
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
        </div>}

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

            // Product-related backdrop query (taxonomy terms match the German
            // AI image descriptions); the sport video stays as fallback only
            const heroFamily = (selectedProduct as any).derived_taxonomy?.product_family;
            const heroImageQuery = [isMotocross ? 'MX' : 'MTB', heroFamily, 'Action Lifestyle']
              .filter(Boolean)
              .join(' ');

            return (
              // V4 Dialog: shown only after tapping the already previewed product again.
              <>
                {this.state.shouldShowV4Dialog && (
                  <HeroVideoBackground
                    storageId={videoStorageId}
                    imageQuery={heroImageQuery}
                    backdropOpacity={1}
                    onClose={() => this.setState({ shouldShowV4Dialog: false })}
                  >
                    {null}
                  </HeroVideoBackground>
                )}
              <ProductOverlayModal
                product={selectedProduct}
                heroDock={this.usesHeroDock() || this.isMobileLayout()}
                expanded={this.state.shouldShowV4Dialog}
                locale={this.props.locale}
                onCollapse={() => this.setState({ shouldShowV4Dialog: false })}
                onClose={this.handleProductDialogClose}
                onPositionChange={this.handleDialogPositionChange}
                onVariantChange={this.handleDialogVariantChange}
                onImageSelect={this.handleDialogImageSelect}
                isHiResReady={this.isHiResReady}
                onShowDetails={() => this.setState({ shouldShowV4Dialog: true })}
                onStepProduct={(dir) => { this.controller.stepHeroProduct(dir); this.setState({ heroPosition: this.controller.getHeroPosition() }, this.syncHeroCardToFocus); }}
                onSiblingSelect={(pid) => {
                  const target = this.controller.getDisplayOrder().find(pr => String(pr.id) === String(pid));
                  if (!target) return false;
                  this.openProductDetails(target, { pushHistory: false });
                  return true;
                }}
                onBuy={this.handleProductBuy}
              />
            </>
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

        {(this.props.realtimeDemoEnabled || this.state.realtimeShortcutEnabled) && (
          <ProductFinderRealtimeSurface
            finderController={this.controller}
            context={{
              brand: this.props.brand,
              language: this.props.locale,
              collection_year: this.props.catalogYear,
              entry_selection: this.props.entrySelection
                ? {
                    sport_id: this.props.entrySelection.sportId,
                    category_id: this.props.entrySelection.categoryId,
                  }
                : null,
            }}
          />
        )}

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
                orderSubmitting={this.state.orderSubmitting}
                orderResult={this.state.orderResult}
                orderError={this.state.orderError}
                onDismissOrderStatus={() => this.setState({ orderResult: null, orderError: null })}
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
    history.pushState({ ...(history.state ?? {}), ...state }, '', window.location.href);
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
   * Browser back = one step back in the trail. Exactly ONE owner per
   * concern: the controller reconciles the pivot depth via its own
   * popstate handler, the catalog gates re-read the URL query, and this
   * handler only closes an open product dialog. It used to drill up on
   * its own ON TOP of the controller handler - every back jumped two
   * levels (owner 2026-08-24).
   */
  private handlePopState = (event: PopStateEvent) => {
    const state = event.state;

    if (!state) {
      // Leaving the app entirely - keep the user in the catalog.
      this.pushHistoryState({ type: 'initial', breadcrumbs: this.state.pivotBreadcrumbs });
      return;
    }

    if (this.state.selectedProduct && state.type !== 'productSelect') {
      this.handleProductDialogClose();
    }
  };
}
