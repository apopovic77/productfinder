import type { AttributeType, Product, ProductAttribute } from '../types/Product';

export type PivotDimensionKind = 'category' | 'class' | 'variation' | 'metadata';

export type PivotDimensionSource =
  | { type: 'category'; level: number }
  | { type: 'attribute'; key: string }
  | { type: 'property'; key: string };

export type NumericBucket = {
  label: string;
  min: number;
  max: number;
  inclusiveMax: boolean;
};

export type NumericSummary = {
  min: number;
  max: number;
  mean: number;
  unit?: string;
  sampleCount: number;
  buckets: NumericBucket[];
};

export interface PivotDimensionDefinition {
  key: string;
  label: string;
  role: PivotDimensionKind;
  priority: number;
  type: AttributeType;
  source: PivotDimensionSource;
  coverage: number;
  cardinality: number;
  entropy: number;
  parentKey?: string;
  numeric?: NumericSummary;
}

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
      return {
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
      };
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

    const ensureCandidate = (key: string, label: string, source: PivotDimensionSource, type: AttributeType, unit?: string, requiredParent?: string) => {
      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          source,
          type,
          requiredParent,
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
      return map.get(key)!;
    };

    const toLabel = (raw: string): string => {
      return raw
        .replace(/[:_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    };

    for (const product of products) {
      // Category hierarchy
      const categories = Array.isArray(product.category) ? product.category.filter(Boolean) : [];
      categories.forEach((value, index) => {
        if (!value) return;
        const key = `category:${index}`;
        const label = index === 0 ? 'Category' : index === 1 ? 'Subcategory' : `Category ${index + 1}`;
        const candidate = ensureCandidate(
          key,
          label,
          { type: 'category', level: index },
          'enum',
          undefined,
          index > 0 ? `category:${index - 1}` : undefined
        );
        this.recordValue(candidate, value, product.id);
      });

      // Brand
      if (product.brand) {
        const candidate = ensureCandidate(
          'property:brand',
          'Brand',
          { type: 'property', key: 'brand' },
          'string'
        );
        this.recordValue(candidate, product.brand, product.id);
      }

      // Season
      if (product.season !== undefined && product.season !== null) {
        const candidate = ensureCandidate(
          'property:season',
          'Season',
          { type: 'property', key: 'season' },
          'number'
        );
        this.recordValue(candidate, String(product.season), product.id);
        candidate.numericValues.push(product.season);
      }

      // Price
      if (product.price?.value !== undefined && product.price?.value !== null) {
        const candidate = ensureCandidate(
          'property:price',
          'Price',
          { type: 'property', key: 'price' },
          'number',
          product.price.currency
        );
        this.recordValue(candidate, this.formatNumeric(product.price.value), product.id);
        candidate.numericValues.push(product.price.value);
      }

      // Weight (specifications or attribute)
      const weight = typeof product.weight === 'number' ? product.weight : undefined;
      if (weight !== undefined) {
        const candidate = ensureCandidate(
          'property:weight',
          'Weight',
          { type: 'property', key: 'weight' },
          'number',
          'g'
        );
        this.recordValue(candidate, this.formatNumeric(weight), product.id);
        candidate.numericValues.push(weight);
      }

      // Attributes
      for (const [attrKey, attr] of Object.entries(product.attributes ?? {})) {
        if (!attr) continue;
        const attrType = this.normalizeAttributeType(attr);
        const label = attr.label?.trim() || toLabel(attrKey);
        const key = `attribute:${attrKey}`;
        const candidate = ensureCandidate(
          key,
          label,
          { type: 'attribute', key: attrKey },
          attrType,
          attr.unit
        );
        const rawValue = attr.value ?? attr.normalizedValue;
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;
        if (attrType === 'number' && typeof rawValue === 'number') {
          candidate.numericValues.push(rawValue);
          this.recordValue(candidate, this.formatNumeric(rawValue), product.id);
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
      candidate.priority = ROLE_PRIORITIES[role];

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
      buckets.push({
        label: this.formatRangeLabel(lower, upper, inclusive, unit),
        min: lower,
        max: upper,
        inclusiveMax: inclusive,
      });
      lower = upper;
    }
    return buckets;
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
    const toText = (v: number) => {
      if (!Number.isFinite(v)) return '∞';
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) >= 10) return v.toFixed(1);
      return v.toFixed(2);
    };

    const format = (v: number) => (unit ? `${toText(v)} ${unit}` : toText(v));

    if (!Number.isFinite(max)) {
      return `${format(min)}+`;
    }
    const maxText = format(max);
    return `${format(min)} – ${inclusive ? maxText : `< ${maxText}`}`;
  }
}
