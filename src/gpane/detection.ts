/**
 * GPANE — Data Type Detection
 *
 * Automatically determines the data type of each property
 * by analyzing the values across all objects.
 *
 * Spec reference: type-detection.html
 */

import type { DataType, Distribution } from './types';

// ============================================================================
// Thresholds (configurable via GPANEConfig in the future)
// ============================================================================

/** Max distinct values for a number to be considered discrete */
const DISCRETE_MAX_CARDINALITY = 15;

/** Max distinct values for a string to be considered categorical */
const CATEGORICAL_MAX_CARDINALITY = 50;

/** If cardinality > this fraction of total objects → identifier */
const IDENTIFIER_THRESHOLD = 0.8;

/** Fraction of values that must contain separators for hierarchical detection */
const HIERARCHICAL_MIN_FRACTION = 0.5;

/** Separators that indicate hierarchical data */
const HIERARCHICAL_SEPARATORS = [' > ', ' >> ', ' / '];

// ============================================================================
// Type Detection
// ============================================================================

/**
 * Detect the data type of a property based on its values across all objects.
 *
 * Decision order:
 * 1. All null → identifier
 * 2. Array → multi_value
 * 3. Boolean → boolean
 * 4. Number → numeric_discrete or numeric_continuous
 * 5. String → hierarchical, identifier, text, or categorical
 */
export function detectDataType(values: unknown[]): DataType {
  // Remove nulls for analysis
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'identifier';

  // Sample first non-null value for type inference
  const first = nonNull[0];

  // 1. Array → multi_value
  if (Array.isArray(first)) return 'multi_value';

  // 2. Boolean detection
  if (isBoolean(nonNull)) return 'boolean';

  // 3. Numeric detection
  if (isNumeric(nonNull)) {
    const numbers = nonNull.map(Number);
    const distinct = new Set(numbers);
    const allInteger = numbers.every(n => Number.isInteger(n));
    if (allInteger && distinct.size <= DISCRETE_MAX_CARDINALITY) {
      return 'numeric_discrete';
    }
    return 'numeric_continuous';
  }

  // 4. String analysis
  if (typeof first === 'string') {
    return classifyString(nonNull as string[]);
  }

  return 'identifier';
}

/**
 * Check if values are boolean.
 * Accepts: true/false, "true"/"false", or exactly 2 distinct string values.
 */
function isBoolean(values: unknown[]): boolean {
  if (values.every(v => typeof v === 'boolean')) return true;

  const strings = values.map(String);
  const unique = new Set(strings);

  // Exactly 2 values that look like boolean
  if (unique.size === 2) {
    const vals = [...unique].map(s => s.toLowerCase());
    if (vals.includes('true') && vals.includes('false')) return true;
    if (vals.includes('yes') && vals.includes('no')) return true;
    if (vals.includes('ja') && vals.includes('nein')) return true;
    if (vals.includes('1') && vals.includes('0')) return true;
  }

  return false;
}

/**
 * Check if values are numeric (all parseable to valid numbers).
 */
function isNumeric(values: unknown[]): boolean {
  // At least 80% must be valid numbers
  let validCount = 0;
  for (const v of values) {
    if (typeof v === 'number' && !isNaN(v)) {
      validCount++;
    } else if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
      validCount++;
    }
  }
  return validCount >= values.length * 0.8;
}

/**
 * Classify a string property into categorical, text, identifier, or hierarchical.
 */
function classifyString(values: string[]): DataType {
  const total = values.length;
  const unique = new Set(values);
  const cardinality = unique.size;

  // Hierarchical: majority of values contain path separators
  const separatorCount = values.filter(v =>
    HIERARCHICAL_SEPARATORS.some(sep => v.includes(sep))
  ).length;
  if (separatorCount >= total * HIERARCHICAL_MIN_FRACTION) {
    return 'hierarchical';
  }

  // Identifier: almost every value is unique
  if (cardinality > total * IDENTIFIER_THRESHOLD && cardinality > 50) {
    return 'identifier';
  }

  // Text: high cardinality but not identifier-level
  if (cardinality > CATEGORICAL_MAX_CARDINALITY) {
    return 'text';
  }

  // Categorical: manageable number of distinct values
  return 'categorical';
}

// ============================================================================
// Distribution Detection
// ============================================================================

/**
 * Detect the distribution shape of numeric values.
 *
 * Spec reference: distribution.html
 */
export function detectDistribution(values: number[]): Distribution {
  if (values.length < 3) return 'uniform';

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)];

  // Normalized entropy
  const freq = new Map<number, number>();
  for (const v of sorted) {
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / n;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(freq.size);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Concentrated: very low entropy
  if (normalizedEntropy < 0.3) return 'concentrated';

  // Uniform: high entropy
  if (normalizedEntropy > 0.9) return 'uniform';

  // Skewed: mean significantly above median (right-skewed)
  // or mean significantly below median (left-skewed)
  if (median > 0 && mean > median * 1.5) return 'skewed';
  if (mean > 0 && median > mean * 1.5) return 'skewed';

  // Long-tail: top 5 values cover > 50% of objects
  const topValues = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topSum = topValues.reduce((a, b) => a + b[1], 0);
  if (topSum > n * 0.5 && freq.size > 10) return 'long_tail';

  // Bimodal: large gap in the middle of sorted values
  const lowerHalf = sorted.slice(0, Math.floor(n / 2));
  const upperHalf = sorted.slice(Math.floor(n / 2));
  const range = sorted[n - 1] - sorted[0];
  if (range > 0) {
    const gap = upperHalf[0] - lowerHalf[lowerHalf.length - 1];
    if (gap / range > 0.3) return 'bimodal';
  }

  return 'uniform';
}
