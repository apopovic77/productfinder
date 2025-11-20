import type { AttributeType, Product, ProductAttribute } from '../types/Product';
import { PivotDimension } from '../domain/PivotDimension';
import type {
  PivotDimensionKind,
  PivotDimensionSource,
  PivotNumericBucket,
  PivotNumericSummary,
} from '../domain/PivotDimension';

export type PivotDimensionDefinition = PivotDimension;
export type NumericBucket = PivotNumericBucket;
export type NumericSummary = PivotNumericSummary;
export type { PivotDimensionKind, PivotDimensionSource };

export type PivotAnalysisResult = {
  dimensions: PivotDimensionDefinition[];
  dimensionModel: Record<PivotDimensionKind, string[]>;
  priorityMap: Record<string, number>;
};

type ValueStat = {
  count: number;
};

type Candidate = {
  key: string;
  label: string;
  source: PivotDimensionSource;
  type: AttributeType;
  requiredParent?: string;
  rawAttributeKey?: string;
  hintRole?: PivotDimensionKind;
  priorityBoost?: number;
  valueStats: Map<string, ValueStat>;
  numericValues: number[];
  unit?: string;
  numericBuckets?: NumericBucket[];
  totalCount: number;
  productHits: Set<string>;
  coverage: number;
  cardinality: number;
  entropy: number;
  role: PivotDimensionKind;
  priority: number;
};

type AnalyzerOptions = {
  minCoverage?: number;
  maxMetadata?: number;
  numericBucketCount?: number;
};

const DEFAULT_OPTIONS: Required<AnalyzerOptions> = {
  minCoverage: 0.1,
  maxMetadata: 6,
  numericBucketCount: 5,
};

const ROLE_PRIORITIES: Record<PivotDimensionKind, number> = {
  category: 1.0,
  class: 0.7,
  variation: 0.4,
  metadata: 0.1,
};

type AttributeHint = {
  candidateKey?: string;
  label?: string;
  role?: PivotDimensionKind;
  parentKey?: string;
  priorityBoost?: number;
  delimiter?: string | RegExp;
  source?: PivotDimensionSource;
};

const ATTRIBUTE_HINTS: Record<string, AttributeHint> = {
  presentation_category: {
    candidateKey: 'category:presentation',
    label: 'Produktkategorie',
    role: 'category',
    priorityBoost: 0.2,
    source: { type: 'attribute', key: 'presentation_category' },
  },
  sport: {
    label: 'Sport',
    role: 'category',
    priorityBoost: 0.05,
  },
  // category_primary: REMOVED - redundant with presentation_category
  category_secondary: {
    candidateKey: 'category:secondary',
    label: 'Unterkategorie',
    role: 'class',
    parentKey: 'category:presentation',
    source: { type: 'category', level: 1 },
  },
  product_family: {
    label: 'Produktfamilie',
    role: 'class',
    parentKey: 'category:presentation',
  },
  taxonomy_path: {
    label: 'Taxonomie',
    role: 'class',
    source: { type: 'attribute', key: 'taxonomy_path', level: 999 }, // level 999 = use last part
  },
  brand: {
    label: 'Brand',
    role: 'class',
  },
  season: {
    label: 'Season',
    role: 'class',
  },
  price: {
    label: 'Price',
    role: 'variation',
  },
  weight: {
    label: 'Weight',
    role: 'variation',
  },
  variant_colors: {
    label: 'Farben',
    role: 'metadata',
    delimiter: '|',
  },
  variant_sizes: {
    label: 'Größen',
    role: 'metadata',
    delimiter: '|',
  },
  variant_count: {
    label: 'Variantenanzahl',
    role: 'metadata',
  },
};

/**
 * Analyse incoming product data to determine meaningful pivot dimensions.
 * Produces a dimension model that can be consumed by the drill-down service.
 */
export class PivotDimensionAnalyzer {
  private options: Required<AnalyzerOptions>;

  constructor(options: AnalyzerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  analyze(products: Product[]): PivotAnalysisResult {
    if (!products.length) {
      return {
        dimensions: [],
        dimensionModel: {
          category: [],
          class: [],
          variation: [],
          metadata: [],
        },
        priorityMap: {},
      };
    }

    const candidates = this.collectCandidates(products);
    this.computeStats(candidates, products.length);
    this.assignRoles(candidates, products.length);
    this.computeNumericBuckets(candidates);

    const epsilon = 1e-6;
    let filtered = candidates.filter(c => c.cardinality > 1 && c.coverage >= 1 - epsilon);
    if (!filtered.length) {
      filtered = candidates.filter(c => c.cardinality > 1 && c.coverage >= this.options.minCoverage);
    }
    filtered.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      if (a.cardinality !== b.cardinality) return a.cardinality - b.cardinality;
      return a.label.localeCompare(b.label);
    });

    const dimensionModel: Record<PivotDimensionKind, string[]> = {
      category: [],
      class: [],
      variation: [],
      metadata: [],
    };
    const priorityMap: Record<string, number> = {};

    const definitions: PivotDimensionDefinition[] = filtered.map(candidate => {
      dimensionModel[candidate.role].push(candidate.key);
      priorityMap[candidate.key] = candidate.priority;
      return new PivotDimension({
        key: candidate.key,
        label: candidate.label,
        role: candidate.role,
        priority: candidate.priority,
        type: candidate.type,
        source: candidate.source,
        coverage: candidate.coverage,
        cardinality: candidate.cardinality,
        entropy: candidate.entropy,
        parentKey: candidate.requiredParent,
        attributeKey: candidate.rawAttributeKey,
        numeric: candidate.numericValues.length
          ? {
              min: Math.min(...candidate.numericValues),
              max: Math.max(...candidate.numericValues),
              mean: candidate.numericValues.reduce((sum, v) => sum + v, 0) / candidate.numericValues.length,
              unit: candidate.unit,
              sampleCount: candidate.numericValues.length,
              buckets: candidate.numericBuckets ?? [],
            }
          : undefined,
      });
    });

    // Limit metadata dimensions to keep UI manageable
    if (dimensionModel.metadata.length > this.options.maxMetadata) {
      const keep = definitions.filter(def => def.role !== 'metadata')
        .concat(definitions.filter(def => def.role === 'metadata').slice(0, this.options.maxMetadata));
      return {
        dimensions: keep,
        dimensionModel: {
          category: dimensionModel.category,
          class: dimensionModel.class,
          variation: dimensionModel.variation,
          metadata: dimensionModel.metadata.slice(0, this.options.maxMetadata),
        },
        priorityMap,
      };
    }

    return {
      dimensions: definitions,
      dimensionModel,
      priorityMap,
    };
  }

  private collectCandidates(products: Product[]): Candidate[] {
    const map = new Map<string, Candidate>();

    const ensureCandidate = (
      key: string,
      label: string,
      source: PivotDimensionSource,
      type: AttributeType,
      unit?: string,
      options?: { requiredParent?: string; rawAttributeKey?: string; hintRole?: PivotDimensionKind; priorityBoost?: number },
    ) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          source,
          type,
          requiredParent: options?.requiredParent,
          rawAttributeKey: options?.rawAttributeKey,
          hintRole: options?.hintRole,
          priorityBoost: options?.priorityBoost,
          valueStats: new Map(),
          numericValues: [],
          unit,
          totalCount: 0,
          productHits: new Set(),
          coverage: 0,
          cardinality: 0,
          entropy: 0,
          role: 'metadata',
          priority: ROLE_PRIORITIES.metadata,
        });
      }
      const candidate = map.get(key)!;
      if (options?.requiredParent && !candidate.requiredParent) {
        candidate.requiredParent = options.requiredParent;
      }
      if (options?.rawAttributeKey) {
        candidate.rawAttributeKey = options.rawAttributeKey;
      }
      if (options?.hintRole) {
        candidate.hintRole = options.hintRole;
      }
      if (options?.priorityBoost) {
        candidate.priorityBoost = (candidate.priorityBoost ?? 0) + options.priorityBoost;
      }
      if (unit && !candidate.unit) {
        candidate.unit = unit;
      }
      return candidate;
    };

    const toLabel = (raw: string): string => {
      return raw
        .replace(/[:_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    };

    for (const product of products) {
      const attributeEntries = Object.entries(product.attributes ?? {});

      const categories = Array.isArray(product.category) ? product.category.filter(Boolean) : [];
      // Skip index 0 (primary category) as it's redundant with presentation_category
      if (categories.length > 1 && !product.hasAttribute('category_primary')) {
        categories.forEach((value, index) => {
          // Skip index 0 - we use presentation_category instead
          if (index === 0 || !value) return;

          const key = `category:${index}`;
          const label = index === 1
              ? 'Unterkategorie'
              : `Kategorie ${index + 1}`;
          const candidate = ensureCandidate(
            key,
            label,
            { type: 'category', level: index },
            'enum',
            undefined,
            {
              requiredParent: index === 1 ? 'category:presentation' : `category:${index - 1}`,
              rawAttributeKey: `legacy_category_${index}`,
              hintRole: 'class',
            }
          );
          this.recordValue(candidate, value, product.id);
        });
      }

      for (const [attrKey, attr] of attributeEntries) {
        // Skip category_primary as it's redundant with presentation_category
        if (attrKey === 'category_primary') continue;

        if (!attr) continue;
        const rawValue = attr.value ?? attr.normalizedValue;
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;

        const hint = ATTRIBUTE_HINTS[attrKey] ?? {};
        const attrType = this.normalizeAttributeType(attr);
        const candidateKey = hint.candidateKey ?? `attribute:${attrKey}`;
        const label = hint.label ?? attr.label?.trim() ?? toLabel(attrKey);
        const source = hint.source ?? { type: 'attribute', key: attrKey };
        const candidate = ensureCandidate(
          candidateKey,
          label,
          source,
          attrType,
          attr.unit,
          {
            requiredParent: hint.parentKey,
            rawAttributeKey: attrKey,
            hintRole: hint.role,
            priorityBoost: hint.priorityBoost,
          }
        );

        if (attrType === 'number' && typeof rawValue === 'number') {
          candidate.numericValues.push(rawValue);
          this.recordValue(candidate, this.formatNumeric(rawValue), product.id);
          continue;
        }

        if (hint.delimiter && typeof rawValue === 'string') {
          const parts = rawValue
            .split(hint.delimiter)
            .map(part => part.trim())
            .filter(Boolean);
          for (const part of parts) {
            this.recordValue(candidate, part, product.id);
          }
        } else {
          this.recordValue(candidate, String(rawValue), product.id);
        }
      }

      const addAiArray = (values: unknown, keySuffix: string, label: string) => {
        if (!values) return;
        const arr = Array.isArray(values)
          ? values
              .map(item => {
                if (item === null || item === undefined) return null;
                const text = String(item).trim();
                return text.length ? text : null;
              })
              .filter((item): item is string => Boolean(item))
          : [String(values).trim()];

        if (!arr.length) return;

        const candidate = ensureCandidate(
          `ai:${keySuffix}`,
          label,
          { type: 'attribute', key: `ai_${keySuffix}` },
          'enum'
        );
        for (const value of arr) {
          this.recordValue(candidate, value, product.id);
        }
      };

      const aiTags = (product as any).aiTags as string[] | undefined;
      addAiArray(aiTags, 'tag', 'AI Tag');

      const aiAnalysis = (product as any).aiAnalysis as any;
      if (aiAnalysis) {
        addAiArray(aiAnalysis.colors, 'color', 'AI Color');
        addAiArray(aiAnalysis.materials, 'material', 'AI Material');
        addAiArray(aiAnalysis.visualHarmonyTags, 'visual-harmony', 'AI Visual Harmony');
        addAiArray(aiAnalysis.keywords, 'keyword', 'AI Keyword');
        addAiArray(aiAnalysis.useCases, 'use-case', 'AI Use Case');
        addAiArray(aiAnalysis.features, 'feature', 'AI Feature');
        addAiArray(aiAnalysis.targetAudience, 'audience', 'AI Audience');
        addAiArray(aiAnalysis.emotionalAppeal, 'emotion', 'AI Emotional Appeal');
        addAiArray(aiAnalysis.dominantColors, 'dominant-color', 'AI Dominant Color');
        addAiArray(aiAnalysis.collections, 'collection', 'AI Collection');

        if (aiAnalysis.style) {
          addAiArray([aiAnalysis.style], 'style', 'AI Style');
        }
        if (aiAnalysis.colorPalette) {
          addAiArray([aiAnalysis.colorPalette], 'color-palette', 'AI Color Palette');
        }
      }
    }

    return Array.from(map.values());
  }

  private recordValue(candidate: Candidate, rawValue: string, productId: string) {
    const normalized = rawValue.trim();
    if (!normalized) return;
    if (productId) {
      candidate.productHits.add(productId);
    }
    const stat = candidate.valueStats.get(normalized) ?? { count: 0 };
    stat.count += 1;
    candidate.valueStats.set(normalized, stat);
    candidate.totalCount += 1;
  }

  private normalizeAttributeType(attr: ProductAttribute): AttributeType {
    if (attr.type) return attr.type;
    const value = attr.value ?? attr.normalizedValue;
    switch (typeof value) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'string':
        return 'string';
      default:
        return 'unknown';
    }
  }

  private computeStats(candidates: Candidate[], productCount: number): void {
    for (const candidate of candidates) {
      const unique = candidate.valueStats.size;
      candidate.cardinality = unique;
      candidate.coverage = productCount > 0 ? candidate.productHits.size / productCount : 0;
      if (unique <= 1 || candidate.totalCount === 0) {
        candidate.entropy = 0;
        continue;
      }
      let entropy = 0;
      for (const stat of candidate.valueStats.values()) {
        const p = stat.count / candidate.totalCount;
        entropy -= p * Math.log2(p);
      }
      const maxEntropy = Math.log2(unique);
      candidate.entropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
    }
  }

  private assignRoles(candidates: Candidate[], productCount: number): void {
    const toLabel = (raw: string): string => raw.replace(/^attribute:/, '').replace(/^property:/, '');

    for (const candidate of candidates) {
      let role: PivotDimensionKind = 'metadata';

      if (candidate.source.type === 'category') {
        role = candidate.source.level === 0 ? 'category' : 'class';
      } else if (candidate.source.type === 'property') {
        switch (candidate.source.key) {
          case 'brand':
            role = 'class';
            break;
          case 'season':
            role = 'class';
            break;
          case 'price':
          case 'weight':
            role = 'variation';
            break;
          default:
            role = 'variation';
            break;
        }
      } else if (candidate.type === 'number') {
        role = 'variation';
      } else {
        const coverage = candidate.coverage;
        const cardinalityRatio = candidate.cardinality / Math.max(1, productCount);
        const entropy = candidate.entropy;

        if (coverage > 0.65 && candidate.cardinality <= Math.max(6, productCount * 0.15) && entropy < 0.6) {
          role = 'category';
        } else if (coverage > 0.5 && candidate.cardinality <= Math.max(12, productCount * 0.2)) {
          role = 'class';
        } else if (coverage > 0.25 && cardinalityRatio <= 0.6) {
          role = 'variation';
        } else {
          role = 'metadata';
        }
      }

      // Ensure at least one category exists: highest coverage string candidate
      candidate.role = role;
      if (candidate.hintRole) {
        role = candidate.hintRole;
      }

      candidate.role = role;
      candidate.priority = ROLE_PRIORITIES[role] + (candidate.priorityBoost ?? 0);

      // Improve label readability for attr/property values
      if (!candidate.label) {
        candidate.label = toLabel(candidate.key)
          .replace(/[_-]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      }
    }

    // Guarantee a category dimension exists by promoting the best candidate if needed
    const hasCategory = candidates.some(c => c.role === 'category');
    if (!hasCategory) {
      const fallback = candidates
        .filter(c => c.type !== 'number')
        .sort((a, b) => {
          const scoreA = a.coverage - a.entropy;
          const scoreB = b.coverage - b.entropy;
          return scoreB - scoreA;
        })[0];
      if (fallback) {
        fallback.role = 'category';
        fallback.priority = ROLE_PRIORITIES.category;
      }
    }
  }

  private computeNumericBuckets(candidates: Candidate[]): void {
    for (const candidate of candidates) {
      if (candidate.numericValues.length < 2) continue;
      const buckets = this.buildBuckets(candidate.numericValues, candidate.unit);
      if (buckets.length) {
        candidate.numericBuckets = buckets;
      }
    }
  }

  private buildBuckets(values: number[], unit?: string): NumericBucket[] {
    const sorted = [...values].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length < 2) return [];

    const bucketCount = this.options.numericBucketCount;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    if (min === max) {
      return [
        {
          label: this.formatRangeLabel(min, Infinity, true, unit),
          min,
          max: Infinity,
          inclusiveMax: true,
        },
      ];
    }

    const step = (max - min) / bucketCount;
    const buckets: NumericBucket[] = [];
    let lower = min;
    for (let i = 0; i < bucketCount; i++) {
      const isLast = i === bucketCount - 1;
      const upper = isLast ? Infinity : lower + step;
      const inclusive = isLast;

      // Smart rounding based on value magnitude
      const roundedLower = this.smartRound(lower);
      const roundedUpper = isLast ? Infinity : this.smartRound(upper);

      buckets.push({
        label: this.formatRangeLabel(roundedLower, roundedUpper, inclusive, unit),
        min: roundedLower,
        max: roundedUpper,
        inclusiveMax: inclusive,
      });
      lower = upper;
    }
    return buckets;
  }

  /**
   * Smart rounding based on value magnitude (proportional):
   * - Values < 10: round to 0.5 (e.g., 3.7 → 4.0, 8.2 → 8.0)
   * - Values 10-100: round to 5 (e.g., 47 → 45, 83 → 85)
   * - Values 100-1000: round to 50 (e.g., 347 → 350, 483 → 500)
   * - Values 1000-10000: round to 500 (e.g., 3470 → 3500, 4830 → 5000)
   * - Values >= 10000: round to 5000 (e.g., 34700 → 35000)
   */
  private smartRound(value: number): number {
    if (!Number.isFinite(value)) return value;

    const absValue = Math.abs(value);
    let rounded: number;

    if (absValue < 10) {
      // Round to 0.5
      rounded = Math.round(value * 2) / 2;
    } else if (absValue < 100) {
      // Round to 5
      rounded = Math.round(value / 5) * 5;
    } else if (absValue < 1000) {
      // Round to 50
      rounded = Math.round(value / 50) * 50;
    } else if (absValue < 10000) {
      // Round to 500
      rounded = Math.round(value / 500) * 500;
    } else {
      // Round to 5000
      rounded = Math.round(value / 5000) * 5000;
    }

    return rounded;
  }

  private formatNumeric(value: number): string {
    if (!Number.isFinite(value)) return '∞';
    if (Math.abs(value) >= 1000) {
      return value.toFixed(0);
    }
    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  }

  private formatRangeLabel(min: number, max: number, inclusive: boolean, unit?: string): string {
    // Check if this is a price (EUR/€) - use simplified format
    const isPrice = unit && (unit.toUpperCase().includes('EUR') || unit.includes('€'));

    if (isPrice) {
      // Simplified price labels for pivot columns
      if (!Number.isFinite(max)) {
        // Last bucket: "> €400"
        return `> €${min}`;
      }
      // All other buckets: "< €100", "< €200", etc.
      return `< €${max}`;
    }

    // Check if this is an integer dimension (e.g., variant count, quantity)
    // If both min and max are whole numbers, treat as integers
    const isInteger = Number.isInteger(min) && (Number.isInteger(max) || !Number.isFinite(max));

    // Non-price formatting (original logic)
    const toText = (v: number) => {
      if (!Number.isFinite(v)) return '∞';
      // For integer dimensions, always show whole numbers
      if (isInteger) return v.toFixed(0);
      // For decimal dimensions, use adaptive precision
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) >= 10) return v.toFixed(1);
      return v.toFixed(2);
    };

    const format = (v: number) => (unit ? `${toText(v)} ${unit}` : toText(v));

    // Simplified pivot labels: Show only upper bound for ranges
    if (!Number.isFinite(max)) {
      // Last bucket: show only lower bound with "+"
      return `${format(min)}+`;
    }

    // For all other buckets: show only upper bound with "<"
    return `< ${format(max)}`;
  }
}
