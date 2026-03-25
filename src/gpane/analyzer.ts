/**
 * GPANE — Property Analyzer
 *
 * Scans all Product objects and computes PropertyAnalysis for each attribute.
 */

import type { Product } from '../types/Product';
import type {
  PropertyAnalysis,
  TopValue,
  NumericRange,
  GPANEConfig,
  BucketStrategy,
  DataType,
} from './types';
import { getProductValue } from './types';
import { detectDataType, detectDistribution } from './detection';

// ============================================================================
// Main Analyzer
// ============================================================================

export function analyzeProperties(
  products: Product[],
  config: GPANEConfig
): PropertyAnalysis[] {
  if (products.length === 0) return [];

  const total = products.length;

  // Collect all attribute keys
  const allKeys = collectAttributeKeys(products);

  const results: PropertyAnalysis[] = [];

  for (const key of allKeys) {
    const override = config.overrides[key];
    if (override?.hidden) continue;

    // Collect values
    const values: unknown[] = [];
    let nullCount = 0;

    for (const product of products) {
      const v = getProductValue(product, key);
      if (v === null || v === undefined || v === '') {
        nullCount++;
      } else {
        values.push(v);
      }
    }

    const coverage = values.length / total;
    if (coverage < config.minCoverage && !override) continue;

    const dataType: DataType = override?.dataType || detectDataType(values);
    if (dataType === 'identifier' && !override) continue;

    const stats = computeStatistics(values, dataType);

    const distribution = (dataType === 'numeric_continuous' || dataType === 'numeric_discrete')
      ? detectDistribution(values.map(Number).filter(n => !isNaN(n)))
      : 'uniform' as const;

    const numericRange = computeNumericRange(values, dataType);
    const isPivotCandidate = coverage >= config.minCoverage && stats.cardinality > 1;

    const strategy: BucketStrategy = override?.strategy
      || recommendStrategy(dataType, stats.cardinality, distribution);

    // Use ProductAttribute label if available, else format key
    const label = override?.label || getAttributeLabel(products, key) || formatLabel(key);

    const unit = getAttributeUnit(products, key);

    results.push({
      key,
      label,
      dataType,
      coverage,
      cardinality: stats.cardinality,
      entropy: stats.entropy,
      distribution,
      nullCount,
      totalCount: total,
      topValues: stats.topValues,
      numericRange,
      isPivotCandidate,
      recommendedStrategy: strategy,
      unit,
    });
  }

  return results;
}

// ============================================================================
// Helpers
// ============================================================================

function collectAttributeKeys(products: Product[]): Set<string> {
  const keys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product.attributes)) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Get the label from the first Product that has this attribute.
 */
function getAttributeLabel(products: Product[], key: string): string | null {
  for (const product of products) {
    const attr = product.attributes[key];
    if (attr) return attr.label;
  }
  return null;
}

/**
 * Get the unit from the first Product that has this attribute.
 */
function getAttributeUnit(products: Product[], key: string): string | null {
  for (const product of products) {
    const attr = product.attributes[key];
    if (attr?.unit) return attr.unit;
  }
  return null;
}

interface Stats {
  cardinality: number;
  entropy: number;
  topValues: TopValue[];
}

function computeStatistics(values: unknown[], dataType: DataType): Stats {
  const freq = new Map<string, number>();

  if (dataType === 'multi_value') {
    for (const arr of values) {
      if (Array.isArray(arr)) {
        for (const v of arr) {
          const key = String(v);
          freq.set(key, (freq.get(key) || 0) + 1);
        }
      }
    }
  } else {
    for (const v of values) {
      const key = String(v);
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }

  const cardinality = freq.size;

  const totalForEntropy = dataType === 'multi_value'
    ? Array.from(freq.values()).reduce((a, b) => a + b, 0)
    : values.length;

  let entropy = 0;
  if (cardinality > 1 && totalForEntropy > 0) {
    for (const count of freq.values()) {
      const p = count / totalForEntropy;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(cardinality);
    entropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  const topValues: TopValue[] = Array.from(freq.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return { cardinality, entropy, topValues };
}

function computeNumericRange(values: unknown[], dataType: DataType): NumericRange | null {
  if (dataType !== 'numeric_continuous' && dataType !== 'numeric_discrete') return null;

  const numbers = values.map(Number).filter(n => !isNaN(n));
  if (numbers.length === 0) return null;

  const sorted = [...numbers].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
  };
}

function recommendStrategy(
  dataType: DataType,
  cardinality: number,
  distribution: string
): BucketStrategy {
  switch (dataType) {
    case 'categorical': return 'identity';
    case 'numeric_continuous':
      if (distribution === 'skewed') return 'range_quantile';
      return 'range_equal_width';
    case 'numeric_discrete':
      return cardinality <= 15 ? 'discrete' : 'range_equal_width';
    case 'boolean': return 'boolean_split';
    case 'multi_value': return 'multi_expansion';
    case 'hierarchical': return 'hierarchical_drill';
    case 'text': return 'text_token';
    default: return 'identity';
  }
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}
