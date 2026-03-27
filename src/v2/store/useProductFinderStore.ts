/**
 * ProductFinder v2 — Zustand Store
 *
 * Central state management for the v2 GPU-instanced renderer.
 * Wraps GPANE engine + PivotLayouter and exposes reactive state for React.
 */
import { create } from 'zustand';
import type { Product } from '../../types/Product';
import type { Bucket } from '../../gpane/types';
import type { PivotDimensionDefinition } from '../../services/PivotDimensionAnalyzer';
import type { LayoutItem } from '../render/PivotLayoutAdapter';
import { V2LayoutService } from '../controller/V2LayoutService';

interface ProductFinderState {
  // Data
  products: Product[];
  loading: boolean;
  error: string | null;

  // Navigation (from GPANE)
  breadcrumbs: string[];
  activeDimension: string | null;
  availableDimensions: PivotDimensionDefinition[];
  heroMode: boolean;
  buckets: Bucket[];
  mode: 'taxonomy' | 'gpane';

  // Layout output (GPU-ready)
  layoutItems: LayoutItem[];
  viewWidth: number;
  viewHeight: number;

  // Interaction
  hoveredProductId: string | null;
  selectedProduct: Product | null;
  transitioning: boolean;

  // Service (not serializable, but Zustand handles it)
  _service: V2LayoutService;

  // Actions
  loadProducts: () => Promise<void>;
  drillDown: (bucketLabel: string, clickOrigin?: { x: number; y: number }) => void;
  drillUp: () => void;
  reset: () => void;
  selectDimension: (key: string) => void;
  setHovered: (id: string | null) => void;
  selectProduct: (product: Product | null) => void;
  resize: (width: number, height: number) => void;
  setFamilyGrouped: (enabled: boolean) => void;
}

export const useProductFinderStore = create<ProductFinderState>((set, get) => {
  const service = new V2LayoutService();

  return {
    products: [],
    loading: false,
    error: null,
    breadcrumbs: ['Alle'],
    activeDimension: null,
    availableDimensions: [],
    heroMode: false,
    buckets: [],
    mode: 'taxonomy',
    layoutItems: [],
    viewWidth: 800,
    viewHeight: 600,
    hoveredProductId: null,
    selectedProduct: null,
    transitioning: false,
    _service: service,

    loadProducts: async () => {
      set({ loading: true, error: null });
      try {
        const { fetchProducts } = await import('../../data/ProductRepository');
        const products = await fetchProducts({ limit: 2000 });

        service.init(products);
        const { viewWidth, viewHeight } = get();
        const layoutItems = service.computeLayout(viewWidth, viewHeight);
        const nav = service.getNavigationState();

        set({
          products,
          loading: false,
          layoutItems,
          ...nav,
        });
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Failed to load', loading: false });
      }
    },

    drillDown: (bucketLabel, clickOrigin) => {
      const { transitioning } = get();
      if (transitioning) return;

      set({ transitioning: true });
      service.drillDown(bucketLabel);
      const { viewWidth, viewHeight } = get();
      const layoutItems = service.computeLayout(viewWidth, viewHeight, clickOrigin);
      const nav = service.getNavigationState();

      set({
        layoutItems,
        ...nav,
      });

      // Clear transitioning after animation
      setTimeout(() => set({ transitioning: false }), 700);
    },

    drillUp: () => {
      const { transitioning } = get();
      if (transitioning) return;

      set({ transitioning: true });
      service.drillUp();
      const { viewWidth, viewHeight } = get();
      const layoutItems = service.computeLayout(viewWidth, viewHeight);
      const nav = service.getNavigationState();

      set({
        layoutItems,
        ...nav,
      });

      setTimeout(() => set({ transitioning: false }), 700);
    },

    reset: () => {
      service.reset();
      const { viewWidth, viewHeight } = get();
      const layoutItems = service.computeLayout(viewWidth, viewHeight);
      const nav = service.getNavigationState();
      set({ layoutItems, ...nav, selectedProduct: null });
    },

    selectDimension: (key) => {
      service.setDimension(key);
      const { viewWidth, viewHeight } = get();
      const layoutItems = service.computeLayout(viewWidth, viewHeight);
      const nav = service.getNavigationState();
      set({ layoutItems, ...nav });
    },

    setHovered: (id) => set({ hoveredProductId: id }),

    selectProduct: (product) => set({ selectedProduct: product }),

    resize: (width, height) => {
      set({ viewWidth: width, viewHeight: height });
      if (get().products.length > 0) {
        const layoutItems = service.computeLayout(width, height);
        set({ layoutItems });
      }
    },

    setFamilyGrouped: (enabled) => {
      service.setFamilyGrouped(enabled);
      const { viewWidth, viewHeight } = get();
      const layoutItems = service.computeLayout(viewWidth, viewHeight);
      const nav = service.getNavigationState();
      set({ layoutItems, ...nav });
    },
  };
});
