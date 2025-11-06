import type { DeveloperSettings } from '../components/DeveloperOverlay';
import type { SortMode } from '../services/FilterService';
import type { LayoutMode } from '../services/LayoutService';

export type FilterDefaults = {
  search: string;
  category: string;
  season: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
};

export type UiDefaults = {
  sortMode: SortMode;
  layoutMode: LayoutMode;
  showOnlyFavorites: boolean;
  showFilters: boolean;
};

export type PivotDefaults = {
  dimension: string;
  rootBreadcrumb: string;
};

export type MediaDefaults = {
  useTrimmedImages: boolean;
};

const FILTER_DEFAULTS: FilterDefaults = {
  search: '',
  category: '',
  season: '',
  priceMin: '',
  priceMax: '',
  weightMin: '',
  weightMax: '',
};

const UI_DEFAULTS: UiDefaults = {
  sortMode: 'none' as SortMode,
  layoutMode: 'pivot' as LayoutMode,
  showOnlyFavorites: false,
  showFilters: true,
};

const PIVOT_DEFAULTS: PivotDefaults = {
  dimension: 'category:presentation',
  rootBreadcrumb: 'All',
};

const MEDIA_DEFAULTS: MediaDefaults = {
  useTrimmedImages: false, // Set to true to use trim=true parameter for transparent backgrounds
};

const DEVELOPER_SETTINGS_DEFAULTS: DeveloperSettings = {
  gridConfig: {
    spacing: 1,
    margin: 50,
    minCellSize: 120,
    maxCellSize: 250,
  },
  forceLabelsConfig: {
    anchorStrength: 0.2,
    repulsionStrength: 200,
    repulsionRadius: 200,
    minDistance: 80,
    maxDistance: 250,
    friction: 0.85,
  },
  showDebugInfo: false,
  showBoundingBoxes: false,
  animationDuration: 1.0,
  priceBucketMode: 'static',
  priceBucketCount: 5,
  heroDisplayMode: 'overlay',
  overlayScaleMode: 'scale-with-content', // Skaliert mit Zoom wie die Produkte
  imageSpreadDirection: 'auto' as 'auto' | 'horizontal' | 'vertical', // auto = based on aspect ratio
};

export const APP_CONFIG = {
  filters: FILTER_DEFAULTS,
  ui: UI_DEFAULTS,
  pivot: PIVOT_DEFAULTS,
  media: MEDIA_DEFAULTS,
  developerSettings: DEVELOPER_SETTINGS_DEFAULTS,
} as const;

export function createDefaultFilterState(): FilterDefaults {
  return { ...APP_CONFIG.filters };
}

export function createDefaultUiState(): UiDefaults {
  return { ...APP_CONFIG.ui };
}

export function createDefaultPivotState(): PivotDefaults {
  return { ...APP_CONFIG.pivot };
}

export function createDefaultMediaState(): MediaDefaults {
  return { ...APP_CONFIG.media };
}

export function createDefaultDeveloperSettings(): DeveloperSettings {
  const defaults = APP_CONFIG.developerSettings;
  return {
    ...defaults,
    gridConfig: { ...defaults.gridConfig },
    forceLabelsConfig: { ...defaults.forceLabelsConfig },
  };
}
