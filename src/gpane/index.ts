/**
 * GPANE — Public API
 *
 * Built for ProductFinder. Works directly with Product objects.
 */

export { GPANEEngine } from './engine';
export type { EngineMode } from './engine';

export type {
  DataType,
  Distribution,
  BucketStrategy,
  PropertyAnalysis,
  TopValue,
  NumericRange,
  Bucket,
  ScoreBreakdown,
  ScoredDimension,
  Constraint,
  FocusEntry,
  PivotState,
  PropertyOverride,
  HierarchyDefinition,
  ScoringWeights,
  GPANEConfig,
  TaxonomyNode,
  NavigationEntry,
} from './types';
export { DEFAULT_CONFIG, getProductValue } from './types';

export { analyzeProperties } from './analyzer';
export { detectDataType, detectDistribution } from './detection';
export { buildBuckets, canSubsplit } from './bucketer';
export { scoreDimensions } from './scorer';

// O'Neal Taxonomy
export { ONEAL_TAXONOMY } from './oneal-taxonomy';

// Pivot Service (drop-in replacement for PivotDrillDownService)
export { GpanePivotService } from './GpanePivotService';
