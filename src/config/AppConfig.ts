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
  dimension: 'category:0',
  rootBreadcrumb: 'All',
};

const DEVELOPER_SETTINGS_DEFAULTS: DeveloperSettings = {
  gridConfig: {
    spacing: 1,
    margin: 50,
    minCellSize: 120,
    maxCellSize: 250,
  },
  forceLabelsConfig: {
    anchorStrength: 0.15,
    repulsionStrength: 100,
    repulsionRadius: 120,
    minDistance: 50,
    maxDistance: 180,
    friction: 0.88,
  },
  showDebugInfo: false,
  showBoundingBoxes: false,
  animationDuration: 1.0,
  priceBucketMode: 'static',
  priceBucketCount: 5,
};

export const APP_CONFIG = {
  filters: FILTER_DEFAULTS,
  ui: UI_DEFAULTS,
  pivot: PIVOT_DEFAULTS,
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

export function createDefaultDeveloperSettings(): DeveloperSettings {
  const defaults = APP_CONFIG.developerSettings;
  return {
    ...defaults,
    gridConfig: { ...defaults.gridConfig },
    forceLabelsConfig: { ...defaults.forceLabelsConfig },
  };
}

