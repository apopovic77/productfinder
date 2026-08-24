/**
 * GPANE — Bucket Builder
 *
 * Forms buckets from Product objects based on dimension and strategy.
 * IRON RULE: Every product MUST end up in a bucket.
 */

import type { Product } from '../types/Product';
import type {
  Bucket,
  PropertyAnalysis,
  GPANEConfig,
} from './types';
import { getProductValue } from './types';

// ============================================================================
// Main Entry Point
// ============================================================================

export function buildBuckets(
  products: Product[],
  dimension: PropertyAnalysis,
  config: GPANEConfig
): Bucket[] {
  const override = config.overrides[dimension.key];
  const strategy = override?.strategy || dimension.recommendedStrategy;
  const maxBuckets = override?.bucketCount || config.maxBuckets;
  const key = dimension.key;

  const unit = dimension.unit || null;

  switch (strategy) {
    case 'identity':
      return identityBuckets(products, key, maxBuckets, override?.normalization);
    case 'range_equal_width':
    case 'range_quantile':
    case 'range_logarithmic': {
      // Range-/Preis-UX (Owner-Feedback 02.08., Post 4427): wenige, gleich
      // gefuellte Buckets statt vieler leerer — Quantile erzwingen und die
      // Bucket-Zahl so waehlen, dass der naechste Klick moeglichst direkt in
      // der Produktansicht landet (Zielgruppengroesse = heroThreshold).
      const targetGroup = Math.max(1, config.heroThreshold);
      const rangeBucketCount = override?.bucketCount
        ?? Math.min(4, Math.max(2, Math.ceil(products.length / targetGroup)));
      return rangeBuckets(products, key, rangeBucketCount, 'quantile', unit)
        .filter(b => b.objectIds.length > 0);
    }
    case 'discrete':
      return discreteBuckets(products, key, maxBuckets);
    case 'boolean_split':
      return booleanBuckets(products, key);
    case 'multi_expansion':
      return multiValueBuckets(products, key, maxBuckets);
    case 'text_token':
      return textBuckets(products, key, maxBuckets, 'token');
    case 'text_prefix':
      return textBuckets(products, key, maxBuckets, 'prefix');
    case 'text_keyword':
      return textBuckets(products, key, maxBuckets, 'keyword');
    case 'text_alphabetic':
      return textBuckets(products, key, maxBuckets, 'alphabetic');
    case 'hierarchical_drill':
      return identityBuckets(products, key, maxBuckets);
    default:
      return identityBuckets(products, key, maxBuckets);
  }
}

// ============================================================================
// Identity Buckets (Categorical)
// ============================================================================

function identityBuckets(
  products: Product[],
  key: string,
  maxBuckets: number,
  normalization?: Record<string, string>
): Bucket[] {
  const groups = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    if (v === null || v === undefined || v === '') {
      unknown.push(product.id);
      continue;
    }

    let label = String(v);
    if (normalization && normalization[label]) {
      label = normalization[label];
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(product.id);
  }

  let buckets: Bucket[] = Array.from(groups.entries())
    .map(([label, ids]) => makeBucket(label, ids))
    .sort((a, b) => b.count - a.count);

  if (buckets.length > maxBuckets) {
    const keep = buckets.slice(0, maxBuckets - 1);
    const rest = buckets.slice(maxBuckets - 1);
    const restIds = rest.flatMap(b => b.objectIds);
    keep.push(makeBucket('Sonstige', restIds, false, true));
    buckets = keep;
  }

  if (unknown.length > 0) {
    buckets.push(makeBucket('N/A', unknown, true));
  }

  return buckets;
}

// ============================================================================
// Range Buckets (Numeric Continuous)
// ============================================================================

function rangeBuckets(
  products: Product[],
  key: string,
  bucketCount: number,
  mode: 'equal_width' | 'quantile' | 'logarithmic',
  unit: string | null = null
): Bucket[] {
  const values: Array<{ id: string; num: number }> = [];
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    const num = Number(v);
    if (v === null || v === undefined || v === '' || isNaN(num)) {
      unknown.push(product.id);
    } else {
      values.push({ id: product.id, num });
    }
  }

  if (values.length === 0) {
    return [makeBucket('N/A', unknown, true)];
  }

  values.sort((a, b) => a.num - b.num);
  const min = values[0].num;
  const max = values[values.length - 1].num;

  // Year-like dimensions: smartRound snapped every boundary to the nearest
  // 500 (2007..2028 all became one ">= 2011" bucket) and toLocaleString
  // rendered "2.011". Whole years, no thousands separator.
  const isYearLike = key.toLowerCase().includes('year')
    || (Number.isInteger(min) && Number.isInteger(max) && min >= 1900 && max <= 2100);
  const roundFn = isYearLike ? Math.round : smartRound;
  const fmtFn = isYearLike ? (v: number) => String(Math.round(v)) : formatNumber;

  if (min === max) {
    const ids = values.map(v => v.id);
    const buckets = [makeBucket(fmtFn(min), ids, false, false, { min, max })];
    if (unknown.length > 0) buckets.push(makeBucket('N/A', unknown, true));
    return buckets;
  }

  let boundaries: number[];

  switch (mode) {
    case 'quantile': {
      boundaries = [];
      for (let i = 1; i < bucketCount; i++) {
        const idx = Math.floor(values.length * i / bucketCount);
        boundaries.push(roundFn(values[idx].num));
      }
      break;
    }
    case 'logarithmic': {
      const logMin = Math.log(Math.max(min, 0.01));
      const logMax = Math.log(max);
      const logStep = (logMax - logMin) / bucketCount;
      boundaries = [];
      for (let i = 1; i < bucketCount; i++) {
        boundaries.push(roundFn(Math.exp(logMin + logStep * i)));
      }
      break;
    }
    default: {
      const step = (max - min) / bucketCount;
      boundaries = [];
      for (let i = 1; i < bucketCount; i++) {
        boundaries.push(roundFn(min + step * i));
      }
      break;
    }
  }

  boundaries = [...new Set(boundaries)].sort((a, b) => a - b);
  boundaries = boundaries.filter(b => b > min);

  const allBounds = [min, ...boundaries];
  const buckets: Bucket[] = [];

  for (let i = 0; i < allBounds.length; i++) {
    const lo = allBounds[i];
    const hi = i < allBounds.length - 1 ? allBounds[i + 1] : Infinity;
    const isFirst = i === 0;
    const isLast = hi === Infinity;

    const ids = values
      .filter(v => {
        if (isLast) return v.num >= lo;
        if (isFirst) return v.num < hi;
        return v.num >= lo && v.num < hi;
      })
      .map(v => v.id);

    if (ids.length === 0) continue;

    const u = unit ? `${unit} ` : '';
    let label: string;
    if (isFirst && !isLast) label = `< ${u}${fmtFn(hi)}`;
    else if (isLast) label = `≥ ${u}${fmtFn(lo)}`;
    else label = `${u}${fmtFn(lo)} – ${u}${fmtFn(hi)}`;

    buckets.push(makeBucket(label, ids, false, false, {
      min: lo,
      max: isLast ? max : hi,
    }));
  }

  if (unknown.length > 0) {
    buckets.push(makeBucket('N/A', unknown, true));
  }

  return buckets;
}

// ============================================================================
// Discrete Buckets
// ============================================================================

function discreteBuckets(products: Product[], key: string, maxBuckets: number): Bucket[] {
  const groups = new Map<number, string[]>();
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    const num = Number(v);
    if (v === null || v === undefined || v === '' || isNaN(num)) {
      unknown.push(product.id);
    } else {
      const intVal = Math.round(num);
      if (!groups.has(intVal)) groups.set(intVal, []);
      groups.get(intVal)!.push(product.id);
    }
  }

  let entries = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  const buckets: Bucket[] = [];

  if (entries.length > maxBuckets) {
    const collapseCount = entries.length - maxBuckets + 1;
    const collapsed = entries.slice(0, collapseCount);
    const collapsedIds = collapsed.flatMap(([, ids]) => ids);
    const label = `≤ ${collapsed[collapsed.length - 1][0]}`;
    buckets.push(makeBucket(label, collapsedIds));
    entries = entries.slice(collapseCount);
  }

  for (const [num, ids] of entries) {
    buckets.push(makeBucket(String(num), ids));
  }

  if (unknown.length > 0) {
    buckets.push(makeBucket('N/A', unknown, true));
  }

  return buckets;
}

// ============================================================================
// Boolean Buckets
// ============================================================================

function booleanBuckets(products: Product[], key: string): Bucket[] {
  const yes: string[] = [];
  const no: string[] = [];
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    if (v === null || v === undefined || v === '') {
      unknown.push(product.id);
    } else if (v === true || v === 'true' || v === 1 || v === '1' || v === 'yes' || v === 'ja') {
      yes.push(product.id);
    } else {
      no.push(product.id);
    }
  }

  const buckets: Bucket[] = [];
  if (yes.length > 0) buckets.push(makeBucket('Ja', yes));
  if (no.length > 0) buckets.push(makeBucket('Nein', no));
  if (unknown.length > 0) buckets.push(makeBucket('N/A', unknown, true));
  return buckets;
}

// ============================================================================
// Multi-Value Buckets
// ============================================================================

function multiValueBuckets(products: Product[], key: string, maxBuckets: number): Bucket[] {
  const groups = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    if (!v || !Array.isArray(v) || v.length === 0) {
      unknown.push(product.id);
    } else {
      for (const item of v) {
        const label = String(item);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(product.id);
      }
    }
  }

  let buckets: Bucket[] = Array.from(groups.entries())
    .map(([label, ids]) => makeBucket(label, ids))
    .sort((a, b) => b.count - a.count);

  if (buckets.length > maxBuckets) {
    const keep = buckets.slice(0, maxBuckets - 1);
    const rest = buckets.slice(maxBuckets - 1);
    const restIds = [...new Set(rest.flatMap(b => b.objectIds))];
    keep.push(makeBucket('Sonstige', restIds, false, true));
    buckets = keep;
  }

  if (unknown.length > 0) {
    buckets.push(makeBucket('N/A', unknown, true));
  }

  return buckets;
}

// ============================================================================
// Text-Transform Buckets
// ============================================================================

function textBuckets(
  products: Product[],
  key: string,
  maxBuckets: number,
  transform: 'token' | 'prefix' | 'keyword' | 'alphabetic'
): Bucket[] {
  // Build a map of product.id → transformed value, then use identity bucketing
  const groups = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const product of products) {
    const v = getProductValue(product, key);
    if (v === null || v === undefined || v === '') {
      unknown.push(product.id);
      continue;
    }

    const str = String(v);
    let result: string | null;

    switch (transform) {
      case 'token':
        result = str.split(/[\s\/\-]+/)[0] || null;
        break;
      case 'prefix':
        result = str.slice(0, 4) || null;
        break;
      case 'alphabetic': {
        const letter = str[0]?.toUpperCase();
        if (!letter || letter < 'A' || letter > 'Z') result = '#';
        else if (letter <= 'D') result = 'A-D';
        else if (letter <= 'H') result = 'E-H';
        else if (letter <= 'L') result = 'I-L';
        else if (letter <= 'P') result = 'M-P';
        else if (letter <= 'T') result = 'Q-T';
        else result = 'U-Z';
        break;
      }
      case 'keyword':
        result = str.split(/[,;\/]+/)[0]?.trim() || null;
        break;
      default:
        result = str;
    }

    if (result === null) {
      unknown.push(product.id);
    } else {
      if (!groups.has(result)) groups.set(result, []);
      groups.get(result)!.push(product.id);
    }
  }

  let buckets: Bucket[] = Array.from(groups.entries())
    .map(([label, ids]) => makeBucket(label, ids))
    .sort((a, b) => b.count - a.count);

  if (buckets.length > maxBuckets) {
    const keep = buckets.slice(0, maxBuckets - 1);
    const rest = buckets.slice(maxBuckets - 1);
    const restIds = rest.flatMap(b => b.objectIds);
    keep.push(makeBucket('Sonstige', restIds, false, true));
    buckets = keep;
  }

  if (unknown.length > 0) {
    buckets.push(makeBucket('N/A', unknown, true));
  }

  return buckets;
}

// ============================================================================
// Subsplit
// ============================================================================

export function canSubsplit(
  objectIds: string[],
  products: Product[],
  dimensionKey: string
): boolean {
  const idSet = new Set(objectIds);
  const subset = products.filter(p => idSet.has(p.id));
  const values = subset
    .map(p => Number(getProductValue(p, dimensionKey)))
    .filter(n => !isNaN(n));

  if (values.length < 10) return false;

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min <= 0) return max - min > min;
  return max / min >= 2;
}

// ============================================================================
// Helpers
// ============================================================================

function makeBucket(
  label: string,
  objectIds: string[],
  isUnknown = false,
  isOther = false,
  range: { min: number; max: number } | null = null
): Bucket {
  return { label, count: objectIds.length, objectIds, isUnknown, isOther, range };
}

function smartRound(value: number): number {
  if (!Number.isFinite(value)) return value;
  const abs = Math.abs(value);
  if (abs < 10) return Math.round(value * 2) / 2;
  if (abs < 100) return Math.round(value / 5) * 5;
  if (abs < 1000) return Math.round(value / 50) * 50;
  if (abs < 10000) return Math.round(value / 500) * 500;
  return Math.round(value / 5000) * 5000;
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  if (Number.isInteger(v)) return v.toLocaleString();
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  return v.toFixed(1);
}
