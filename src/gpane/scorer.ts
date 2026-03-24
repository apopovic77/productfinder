/**
 * GPANE — Scoring Engine
 *
 * Scores dimensions to determine the best pivot for Product data.
 */

import type { Product } from '../types/Product';
import type {
  PropertyAnalysis,
  ScoredDimension,
  ScoreBreakdown,
  GPANEConfig,
  HierarchyDefinition,
} from './types';
import { getProductValue } from './types';
import { buildBuckets } from './bucketer';
import { analyzeProperties } from './analyzer';

// ============================================================================
// Main Scoring Function
// ============================================================================

export function scoreDimensions(
  dimensions: PropertyAnalysis[],
  products: Product[],
  activeDimensionKey: string | null,
  history: string[],
  config: GPANEConfig
): ScoredDimension[] {
  const candidates = dimensions.filter(d => d.isPivotCandidate);
  if (candidates.length === 0) return [];

  const contextDimensions = products.length < dimensions[0]?.totalCount
    ? analyzeProperties(products, config)
    : dimensions;

  const scored: ScoredDimension[] = candidates.map(dim => {
    const contextDim = contextDimensions.find(d => d.key === dim.key) || dim;

    const score = computeScore(
      contextDim,
      products,
      activeDimensionKey,
      history,
      candidates,
      config
    );

    return { ...contextDim, score };
  });

  scored.sort((a, b) => b.score.total - a.score.total);
  return scored;
}

// ============================================================================
// Score Computation
// ============================================================================

function computeScore(
  dim: PropertyAnalysis,
  products: Product[],
  activeDimensionKey: string | null,
  history: string[],
  allCandidates: PropertyAnalysis[],
  config: GPANEConfig
): ScoreBreakdown {
  const w = config.scoring;

  const override = config.overrides[dim.key];
  if (override?.priority != null) {
    return {
      total: override.priority,
      coverage: dim.coverage,
      diversity: dim.entropy,
      informationGain: 0,
      usability: 0,
      redundancy: 0,
      history: 0,
      fragmentation: 0,
      hierarchyBonus: 0,
    };
  }

  const coverageScore = dim.coverage;
  const diversityScore = computeDiversity(dim);
  const igScore = computeInformationGain(dim, products, allCandidates, config);
  const usabilityScore = computeUsability(dim, config.maxBuckets);
  const redundancyPenalty = computeRedundancy(dim, activeDimensionKey, products, allCandidates, config);
  const historyPenalty = computeHistory(dim, history);
  const fragmentationPenalty = computeFragmentation(dim);
  const hierarchyBonus = computeHierarchyBonus(dim.key, activeDimensionKey, config.hierarchies);

  const total =
    coverageScore * w.coverage
    + diversityScore * w.diversity
    + igScore * w.informationGain
    + usabilityScore * w.usability
    - redundancyPenalty * w.redundancy
    - historyPenalty * w.history
    - fragmentationPenalty * w.fragmentation
    + hierarchyBonus;

  return {
    total: round(total),
    coverage: round(coverageScore),
    diversity: round(diversityScore),
    informationGain: round(igScore),
    usability: round(usabilityScore),
    redundancy: round(redundancyPenalty),
    history: round(historyPenalty),
    fragmentation: round(fragmentationPenalty),
    hierarchyBonus: round(hierarchyBonus),
  };
}

// ============================================================================
// Individual Score Factors
// ============================================================================

function computeDiversity(dim: PropertyAnalysis): number {
  if (dim.cardinality <= 1) return 0;
  return dim.entropy * (1 - 1 / dim.cardinality);
}

function computeInformationGain(
  dim: PropertyAnalysis,
  products: Product[],
  allCandidates: PropertyAnalysis[],
  config: GPANEConfig
): number {
  if (products.length < 10 || dim.cardinality <= 1) return 0;

  const otherDims = allCandidates
    .filter(d => d.key !== dim.key && d.cardinality > 1)
    .sort((a, b) => b.entropy - a.entropy)
    .slice(0, 3);

  if (otherDims.length === 0) return 0;

  const buckets = buildBuckets(products, dim, config);
  const nonEmptyBuckets = buckets.filter(b => !b.isUnknown && b.count > 0);
  if (nonEmptyBuckets.length <= 1) return 0;

  // Build id→product lookup for bucket membership
  const productMap = new Map<string, Product>();
  for (const p of products) productMap.set(p.id, p);

  let totalIG = 0;

  for (const otherDim of otherDims) {
    const globalEntropy = otherDim.entropy;
    if (globalEntropy === 0) continue;

    let weightedEntropy = 0;
    const totalInBuckets = nonEmptyBuckets.reduce((a, b) => a + b.count, 0);

    for (const bucket of nonEmptyBuckets) {
      if (bucket.count < 2) continue;

      const values: unknown[] = [];
      for (const id of bucket.objectIds) {
        const p = productMap.get(id);
        if (!p) continue;
        const v = getProductValue(p, otherDim.key);
        if (v !== null && v !== undefined && v !== '') values.push(v);
      }

      if (values.length < 2) continue;

      const freq = new Map<string, number>();
      for (const v of values) {
        const key = String(v);
        freq.set(key, (freq.get(key) || 0) + 1);
      }

      let bucketEntropy = 0;
      const n = values.length;
      for (const count of freq.values()) {
        const p = count / n;
        if (p > 0) bucketEntropy -= p * Math.log2(p);
      }
      const maxE = Math.log2(freq.size);
      const normalizedBucketEntropy = maxE > 0 ? bucketEntropy / maxE : 0;

      weightedEntropy += (bucket.count / totalInBuckets) * normalizedBucketEntropy;
    }

    const ig = Math.max(0, 1 - weightedEntropy);
    totalIG += ig;
  }

  return totalIG / otherDims.length;
}

function computeUsability(dim: PropertyAnalysis, maxBuckets: number): number {
  const effectiveBuckets = Math.min(dim.cardinality, maxBuckets);
  if (effectiveBuckets <= 1) return 0;
  if (effectiveBuckets === 2) return 0.5;
  if (effectiveBuckets >= 3 && effectiveBuckets <= 10) return 1.0;
  return Math.max(0, 1.0 - (effectiveBuckets - 10) * 0.08);
}

function computeRedundancy(
  dim: PropertyAnalysis,
  activeDimensionKey: string | null,
  products: Product[],
  allCandidates: PropertyAnalysis[],
  config: GPANEConfig
): number {
  if (!activeDimensionKey || dim.key === activeDimensionKey) return 1.0;

  const activeDim = allCandidates.find(d => d.key === activeDimensionKey);
  if (!activeDim) return 0;

  if (
    Math.abs(activeDim.cardinality - dim.cardinality) <= 2 &&
    Math.abs(activeDim.entropy - dim.entropy) < 0.1 &&
    activeDim.coverage > 0.9 && dim.coverage > 0.9
  ) {
    const activeBuckets = buildBuckets(products, activeDim, config);
    const thisBuckets = buildBuckets(products, dim, config);

    const activeMap = new Map<string, string>();
    for (const b of activeBuckets) for (const id of b.objectIds) activeMap.set(id, b.label);

    const thisMap = new Map<string, string>();
    for (const b of thisBuckets) for (const id of b.objectIds) thisMap.set(id, b.label);

    let sameCount = 0;
    let totalPairs = 0;
    const ids = products.map(p => p.id);
    const sampleSize = Math.min(ids.length, 200);
    const step = Math.max(1, Math.floor(ids.length / sampleSize));

    for (let i = 0; i < ids.length; i += step) {
      for (let j = i + step; j < ids.length; j += step) {
        const sameActive = activeMap.get(ids[i]) === activeMap.get(ids[j]);
        const sameThis = thisMap.get(ids[i]) === thisMap.get(ids[j]);
        if (sameActive === sameThis) sameCount++;
        totalPairs++;
      }
    }

    return totalPairs > 0 ? sameCount / totalPairs : 0;
  }

  return 0;
}

function computeHistory(dim: PropertyAnalysis, history: string[]): number {
  const lastIndex = history.lastIndexOf(dim.key);
  if (lastIndex < 0) return 0;
  const stepsAgo = history.length - lastIndex;
  if (stepsAgo <= 1) return 1.0;
  if (stepsAgo <= 3) return 0.5;
  if (stepsAgo <= 5) return 0.2;
  return 0;
}

function computeFragmentation(dim: PropertyAnalysis): number {
  if (dim.cardinality <= 12) {
    const smallCount = dim.topValues.filter(v => v.count < 3).length;
    return dim.cardinality > 0 ? smallCount / dim.cardinality : 0;
  }
  return 0;
}

function computeHierarchyBonus(
  dimensionKey: string,
  activeDimensionKey: string | null,
  hierarchies: HierarchyDefinition[]
): number {
  if (!activeDimensionKey || hierarchies.length === 0) return 0;

  for (const hierarchy of hierarchies) {
    const activeIndex = hierarchy.levels.indexOf(activeDimensionKey);
    const thisIndex = hierarchy.levels.indexOf(dimensionKey);
    if (activeIndex >= 0 && thisIndex === activeIndex + 1) {
      return hierarchy.bonusPerLevel;
    }
  }

  return 0;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
