/**
 * GPANE — Type Definitions
 *
 * Built for the ProductFinder. Works directly with Product objects.
 */

import type { Product } from '../types/Product';

// ============================================================================
// Data Types
// ============================================================================

export type DataType =
  | 'categorical'
  | 'numeric_continuous'
  | 'numeric_discrete'
  | 'boolean'
  | 'multi_value'
  | 'hierarchical'
  | 'text'
  | 'identifier';

export type Distribution =
  | 'uniform'
  | 'skewed'
  | 'bimodal'
  | 'long_tail'
  | 'concentrated';

// ============================================================================
// Bucket Strategies
// ============================================================================

export type BucketStrategy =
  | 'identity'
  | 'range_equal_width'
  | 'range_quantile'
  | 'range_logarithmic'
  | 'discrete'
  | 'boolean_split'
  | 'multi_expansion'
  | 'hierarchical_drill'
  | 'text_token'
  | 'text_prefix'
  | 'text_keyword'
  | 'text_alphabetic';

// ============================================================================
// Property Analysis
// ============================================================================

export interface PropertyAnalysis {
  key: string;
  label: string;
  dataType: DataType;
  coverage: number;
  cardinality: number;
  entropy: number;
  distribution: Distribution;
  nullCount: number;
  totalCount: number;
  topValues: TopValue[];
  numericRange: NumericRange | null;
  isPivotCandidate: boolean;
  recommendedStrategy: BucketStrategy;
  unit: string | null;
}

export interface TopValue {
  value: string;
  count: number;
}

export interface NumericRange {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

// ============================================================================
// Buckets
// ============================================================================

export interface Bucket {
  label: string;
  count: number;
  objectIds: string[];
  isUnknown: boolean;
  isOther: boolean;
  range: { min: number; max: number } | null;
}

// ============================================================================
// Scoring
// ============================================================================

export interface ScoreBreakdown {
  total: number;
  coverage: number;
  diversity: number;
  informationGain: number;
  usability: number;
  redundancy: number;
  history: number;
  fragmentation: number;
  hierarchyBonus: number;
}

export interface ScoredDimension extends PropertyAnalysis {
  score: ScoreBreakdown;
}

// ============================================================================
// Navigation Stack
// ============================================================================

/**
 * A single entry in the navigation stack.
 * Captures everything about one navigation level — no reconstruction needed.
 */
export interface NavigationEntry {
  /** Display label: "MTB", "Kleidung", "ELEMENT" */
  label: string;

  /** How this level was reached */
  source: 'taxonomy' | 'gpane';

  /** Which dimension groups this level's buckets (null for taxonomy) */
  dimensionKey: string | null;

  /** Human-readable dimension label */
  dimensionLabel: string | null;

  /** Product IDs at this level */
  objectIds: string[];

  /**
   * Bucket-Labels der Ebene, aus der dieser Schritt gewaehlt wurde —
   * die Geschwister-Alternativen fuer den Breadcrumb-Dropdown
   * (Explorer-Pattern, owner 2026-08-25). Roh-Labels, wie drillDown
   * sie erwartet.
   */
  siblings?: string[];
}

// ============================================================================
// Pivot State
// ============================================================================

export interface Constraint {
  dimension: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range' | 'in';
  value: unknown;
}

export interface FocusEntry {
  dimension: string;
  bucketLabel: string;
  objectIds: string[];
}

export interface PivotState {
  allObjects: Product[];
  constraints: Constraint[];
  constrainedObjects: Product[];
  focusStack: FocusEntry[];
  focusedObjects: Product[];
  activeDimension: ScoredDimension | null;
  buckets: Bucket[];
  dimensionHistory: string[];
  availableDimensions: ScoredDimension[];

  /** Navigation breadcrumb stack — single source of truth for breadcrumbs */
  navigationStack: NavigationEntry[];
}

// ============================================================================
// Configuration
// ============================================================================

export interface PropertyOverride {
  dataType?: DataType;
  strategy?: BucketStrategy;
  bucketCount?: number;
  label?: string;
  priority?: number;
  hidden?: boolean;
  /** Set by engine.setHiddenKeys(); distinguishes runtime locks from static config. */
  __upstreamLock?: boolean;
  customBuckets?: string[];
  normalization?: Record<string, string>;
}

// ============================================================================
// Taxonomy (Predefined Navigation Tree)
// ============================================================================

/**
 * A node in a predefined navigation tree.
 * Used in Taxonomy mode — the user navigates a fixed tree
 * instead of GPANE auto-scoring dimensions.
 */
export interface TaxonomyNode {
  /** Display label */
  label: string;

  /** URL-friendly slug */
  slug: string;

  /** Which products belong to this node */
  match: (product: Product) => boolean;

  /** Child nodes (next level when user clicks this node) */
  children?: TaxonomyNode[];
}

export interface HierarchyDefinition {
  name: string;
  levels: string[];
  bonusPerLevel: number;
  strictOrder: boolean;
}

export interface ScoringWeights {
  coverage: number;
  diversity: number;
  informationGain: number;
  usability: number;
  redundancy: number;
  history: number;
  fragmentation: number;
}

export interface GPANEConfig {
  maxBuckets: number;
  minCoverage: number;
  scoring: ScoringWeights;
  overrides: Record<string, PropertyOverride>;
  hierarchies: HierarchyDefinition[];
  domain: string;

  /** Predefined navigation tree. When set, engine starts in taxonomy mode. */
  taxonomy?: TaxonomyNode[];

  /** Max products for hero mode to be considered (default: 15) */
  heroThreshold: number;
}

export const DEFAULT_CONFIG: GPANEConfig = {
  maxBuckets: 12,
  minCoverage: 0.5,
  heroThreshold: 40,
  scoring: {
    coverage: 0.25,
    diversity: 0.25,
    informationGain: 0.20,
    usability: 0.15,
    redundancy: 0.10,
    history: 0.05,
    fragmentation: 0.05,
  },
  overrides: {},
  hierarchies: [],
  domain: 'generic',
};

// ============================================================================
// Product Value Accessor
// ============================================================================

/**
 * Read an attribute value from a Product.
 * Central accessor — the ONLY place GPANE touches Product internals.
 */
export function getProductValue(product: Product, key: string): unknown {
  const attr = product.attributes[key];
  if (!attr) return undefined;
  return attr.value;
}
