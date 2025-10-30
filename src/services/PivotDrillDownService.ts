import type { Product } from '../types/Product';
import { PivotGroup } from '../layout/PivotGroup';
import type {
  NumericBucket,
  PivotAnalysisResult,
  PivotDimensionDefinition,
  PivotDimensionKind,
} from './PivotDimensionAnalyzer';

export type GroupDimension = string;

export type PriceBucketMode = 'static' | 'equal-width' | 'quantile' | 'kmeans';

export type PriceBucketConfig = {
  mode: PriceBucketMode;
  bucketCount: number;
};

type DrillDownFilter = {
  dimension: GroupDimension;
  value: string;
  range?: { min: number; max: number; inclusiveMax: boolean };
};

type NumericDimensionState = {
  buckets: NumericBucket[];
  bucketMap: Map<string, NumericBucket>;
  unit?: string;
};

export type DrillDownState = {
  dimension: GroupDimension;
  filters: DrillDownFilter[];
};

const UNKNOWN_LABEL = 'Unknown';
const NONE_LABEL = 'None';

const DEFAULT_HERO_THRESHOLD = 10;
const PRICE_REFINE_THRESHOLD = 8;

/**
 * Service for managing pivot drill-down state using dynamically analysed dimensions.
 */
export class PivotDrillDownService {
  private analysis: PivotAnalysisResult | null = null;
  private dimensions: PivotDimensionDefinition[] = [];
  private dimensionByKey = new Map<GroupDimension, PivotDimensionDefinition>();
  private hierarchy: GroupDimension[] = [];

  private filterStack: DrillDownFilter[] = [];
  private rootDimensionIndex = 0;
  private currentDimensionIndex = 0;
  private currentDimensionKey: GroupDimension | null = null;

  private priceBucketMode: PriceBucketMode = 'static';
  private priceBucketCount = 5;
  private numericStates = new Map<GroupDimension, NumericDimensionState>();
  private dimensionOrder = new Map<GroupDimension, Map<string, number>>();

  private heroThreshold = DEFAULT_HERO_THRESHOLD;
  private heroModeActive = false;

  setModel(analysis: PivotAnalysisResult | null): void {
    this.analysis = analysis;
    this.dimensions = analysis?.dimensions ?? [];
    this.dimensionByKey.clear();
    this.hierarchy = [];
    for (const dimension of this.dimensions) {
      this.dimensionByKey.set(dimension.key, dimension);
      this.hierarchy.push(dimension.key);
    }
    this.filterStack = [];
    this.numericStates.clear();
    this.heroModeActive = false;

    const preferred = this.dimensions.find(d => d.role === 'category') ?? this.dimensions[0];
    if (preferred) {
      const index = this.hierarchy.indexOf(preferred.key);
      this.rootDimensionIndex = index >= 0 ? index : 0;
      this.currentDimensionIndex = this.rootDimensionIndex;
      this.currentDimensionKey = this.hierarchy[this.currentDimensionIndex] ?? null;
    } else {
      this.rootDimensionIndex = 0;
      this.currentDimensionIndex = 0;
      this.currentDimensionKey = null;
    }
  }

  setHeroThreshold(threshold: number): void {
    this.heroThreshold = Math.max(1, Math.floor(threshold));
  }

  setPriceBucketConfig({ mode, bucketCount }: PriceBucketConfig): void {
    this.priceBucketMode = mode;
    this.priceBucketCount = Math.max(1, bucketCount);
    this.numericStates.clear();
  }

  setDimensionOrder(dimension: GroupDimension, order: Map<string, number>): void {
    this.dimensionOrder.set(dimension, new Map(order));
  }

  setDimension(dimension: GroupDimension): void {
    if (!this.hasDimension(dimension)) return;
    const index = this.hierarchy.indexOf(dimension);
    if (index === -1) return;
    this.rootDimensionIndex = index;
    this.currentDimensionIndex = index;
    this.currentDimensionKey = dimension;
    this.filterStack = [];
    this.numericStates.clear();
    this.heroModeActive = false;
  }

  setGroupingDimension(dimension: GroupDimension): void {
    if (!this.hasDimension(dimension)) return;
    if (!this.canUseDimension(dimension)) return;
    const index = this.hierarchy.indexOf(dimension);
    if (index === -1) return;
    this.currentDimensionIndex = index;
    this.currentDimensionKey = dimension;
    if (!this.isNumericDimension(dimension)) {
      this.numericStates.delete(dimension);
    }
  }

  getDimension(): GroupDimension {
    return this.currentDimensionKey ?? this.hierarchy[this.currentDimensionIndex] ?? this.hierarchy[0] ?? '';
  }

  getHierarchy(): GroupDimension[] {
    return [...this.hierarchy];
  }

  getAvailableDimensions(products: Product[]): GroupDimension[] {
    const filtered = this.filterProducts(products);
    const dims: GroupDimension[] = [];
    for (const key of this.hierarchy) {
      if (!this.canUseDimension(key)) continue;
      if (this.countDistinctValues(filtered, key) > 1) {
        dims.push(key);
      }
    }
    return dims;
  }

  getDimensionsByRole(role: PivotDimensionKind): PivotDimensionDefinition[] {
    return this.dimensions.filter(d => d.role === role);
  }

  canUseDimension(dimension: GroupDimension): boolean {
    const def = this.dimensionByKey.get(dimension);
    if (!def) return false;
    if (def.parentKey) {
      return this.filterStack.some(f => f.dimension === def.parentKey);
    }
    return true;
  }

  canDrillDown(): boolean {
    if (this.filterStack.length >= this.hierarchy.length) return false;
    const index = this.currentDimensionIndex;
    for (let i = index + 1; i < this.hierarchy.length; i++) {
      const key = this.hierarchy[i];
      if (!this.canUseDimension(key)) continue;
      if (this.hasDimension(key)) return true;
    }
    return false;
  }

  canDrillUp(): boolean {
    return this.filterStack.length > 0;
  }

  drillDown(value: string): boolean {
    const dimension = this.getDimension();
    const def = this.dimensionByKey.get(dimension);
    if (!def) return false;
    const trimmed = value?.trim();
    if (!trimmed) return false;

    const entry: DrillDownFilter = { dimension, value: trimmed };
    if (this.isNumericDimension(dimension)) {
      const state = this.numericStates.get(dimension);
      const bucket = state?.bucketMap.get(trimmed);
      if (bucket) {
        entry.range = { min: bucket.min, max: bucket.max, inclusiveMax: bucket.inclusiveMax };
      }
    }
    this.filterStack.push(entry);
    this.syncDimensionWithStack();
    this.heroModeActive = false;
    if (this.isNumericDimension(dimension)) {
      this.numericStates.delete(dimension);
    }
    return true;
  }

  drillUp(): boolean {
    if (!this.filterStack.length) return false;
    const removed = this.filterStack.pop()!;
    if (this.isNumericDimension(removed.dimension)) {
      this.numericStates.delete(removed.dimension);
    }
    this.syncDimensionWithStack();
    this.heroModeActive = false;
    return true;
  }

  reset(): void {
    this.filterStack = [];
    this.currentDimensionIndex = this.rootDimensionIndex;
    this.currentDimensionKey = this.hierarchy[this.currentDimensionIndex] ?? null;
    this.numericStates.clear();
    this.heroModeActive = false;
  }

  getFilters(): DrillDownFilter[] {
    return this.filterStack.map(f => ({
      dimension: f.dimension,
      value: f.value,
      range: f.range ? { ...f.range } : undefined,
    }));
  }

  getBreadcrumbs(): string[] {
    return ['All', ...this.filterStack.map(f => f.value)];
  }

  getState(): DrillDownState {
    return {
      dimension: this.hierarchy[this.rootDimensionIndex] ?? '',
      filters: this.getFilters(),
    };
  }

  setState(state: DrillDownState): void {
    const idx = this.hierarchy.indexOf(state.dimension);
    if (idx >= 0) {
      this.rootDimensionIndex = idx;
      this.currentDimensionIndex = idx;
      this.currentDimensionKey = this.hierarchy[idx] ?? null;
    } else {
      this.rootDimensionIndex = 0;
      this.currentDimensionIndex = 0;
      this.currentDimensionKey = this.hierarchy[0] ?? null;
    }

    const validFilters: DrillDownFilter[] = [];
    for (const filter of state.filters) {
      if (!this.dimensionByKey.has(filter.dimension)) {
        continue;
      }
      validFilters.push({
        dimension: filter.dimension,
        value: filter.value,
        range: filter.range ? { ...filter.range } : undefined,
      });
    }

    this.filterStack = validFilters;
    this.numericStates.clear();
    this.syncDimensionWithStack();
  }

  filterProducts(products: Product[]): Product[] {
    if (!this.filterStack.length) return [...products];
    return products.filter(product => {
      for (const filter of this.filterStack) {
        if (!this.matchesFilter(product, filter)) return false;
      }
      return true;
    });
  }

  groupProducts(products: Product[]): Map<string, Product[]> {
    if (!products.length) {
      this.heroModeActive = false;
      return new Map();
    }

    const filtered = this.filterProducts(products);
    this.heroModeActive = filtered.length > 0 && filtered.length <= this.heroThreshold;

    if (!filtered.length) {
      this.numericStates.clear();
      return new Map();
    }

    this.ensureMeaningfulDimension(filtered);

    const dimension = this.getDimension();
    if (this.isNumericDimension(dimension)) {
      this.recomputeNumericBuckets(filtered, dimension);
    }

    const groups = new Map<string, Product[]>();
    for (const product of filtered) {
      const key = this.getDimensionValue(product, dimension);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(product);
    }
    return this.sortGroups(groups, dimension);
  }

  createGroups(products: Product[]): PivotGroup[] {
    const grouped = this.groupProducts(products);
    const dimension = this.getDimension();
    const def = this.dimensionByKey.get(dimension);
    const label = def?.label ?? dimension;

    const keys = Array.from(grouped.keys());
    const result: PivotGroup[] = [];
    for (const key of keys) {
      result.push(new PivotGroup(
        key,
        this.formatGroupLabel(key, label),
        this.filterStack.length
      ));
    }
    return result;
  }

  getGroupKey(product: Product): string {
    const dimension = this.getDimension();
    return this.getDimensionValue(product, dimension);
  }

  isHeroModeActive(): boolean {
    return this.heroModeActive;
  }

  private hasDimension(key: GroupDimension): boolean {
    return this.dimensionByKey.has(key);
  }

  private isNumericDimension(dimension: GroupDimension): boolean {
    const def = this.dimensionByKey.get(dimension);
    return !!def && (def.type === 'number' || !!def.numeric);
  }

  private matchesFilter(product: Product, filter: DrillDownFilter): boolean {
    const def = this.dimensionByKey.get(filter.dimension);
    if (!def) return true;

    if (filter.range) {
      const numeric = this.extractNumericValue(product, def);
      if (numeric === undefined || numeric === null) return false;
      const upperOk = filter.range.max === Infinity
        ? true
        : filter.range.inclusiveMax
          ? numeric <= filter.range.max
          : numeric < filter.range.max;
      return numeric >= filter.range.min && upperOk;
    }

    const value = this.getDimensionValue(product, filter.dimension);
    return value === filter.value;
  }

  private ensureMeaningfulDimension(products: Product[]): void {
    if (!products.length) return;
    let index = this.currentDimensionIndex;
    while (index < this.hierarchy.length) {
      const key = this.hierarchy[index];
      if (!this.canUseDimension(key)) {
        index++;
        continue;
      }
      const distinct = this.countDistinctValues(products, key);
      if (distinct > 1) break;
      index++;
    }
    if (index >= this.hierarchy.length) {
      index = this.currentDimensionIndex;
    }
    if (index !== this.currentDimensionIndex) {
      this.currentDimensionIndex = index;
      this.currentDimensionKey = this.hierarchy[index] ?? null;
      if (this.currentDimensionKey && !this.isNumericDimension(this.currentDimensionKey)) {
        this.numericStates.delete(this.currentDimensionKey);
      }
    }
  }

  private syncDimensionWithStack(): void {
    if (!this.filterStack.length) {
      this.currentDimensionIndex = this.rootDimensionIndex;
    } else {
      const last = this.filterStack[this.filterStack.length - 1];
      const lastIndex = this.hierarchy.indexOf(last.dimension);
      this.currentDimensionIndex = Math.min(
        lastIndex >= 0 ? lastIndex + 1 : this.rootDimensionIndex,
        this.hierarchy.length - 1
      );
    }
    this.currentDimensionKey = this.hierarchy[this.currentDimensionIndex] ?? null;
  }

  private countDistinctValues(products: Product[], dimension: GroupDimension): number {
    const def = this.dimensionByKey.get(dimension);
    if (!def) return 0;
    if (this.isNumericDimension(dimension)) {
      const numeric = products
        .map(p => this.extractNumericValue(p, def))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (!numeric.length) return 0;
      const buckets = this.buildNumericBuckets(numeric, def);
      return buckets.length || new Set(numeric).size;
    }
    const values = new Set<string>();
    for (const product of products) {
      values.add(this.getDimensionValue(product, dimension));
    }
    return values.size;
  }

  private getDimensionValue(product: Product, dimension: GroupDimension): string {
    const def = this.dimensionByKey.get(dimension);
    if (!def) return UNKNOWN_LABEL;
    if (this.isNumericDimension(dimension)) {
      const numeric = this.extractNumericValue(product, def);
      if (numeric === undefined || numeric === null || !Number.isFinite(numeric)) {
        return NONE_LABEL;
      }
      const bucket = this.findBucket(dimension, numeric);
      if (bucket) return bucket.label;
      return this.formatNumeric(numeric, def.numeric?.unit);
    }
    const raw = this.extractRawValue(product, def);
    if (raw === undefined || raw === null || raw === '') {
      return UNKNOWN_LABEL;
    }
    return String(raw);
  }

  private extractRawValue(product: Product, def: PivotDimensionDefinition): unknown {
    switch (def.source.type) {
      case 'category': {
        const list = Array.isArray(product.category) ? product.category.filter(Boolean) : [];
        if (!list.length) return null;
        const requestedLevel = def.source.level;
        if (requestedLevel === 0) {
          return list[0];
        }

        const topCategories = this.dimensionOrder.get('category:0');
        const disallowed = new Set<string>();
        disallowed.add(list[0]);
        for (const filter of this.filterStack) {
          const filterDef = this.dimensionByKey.get(filter.dimension);
          if (filterDef?.source.type === 'category') {
            disallowed.add(filter.value);
          }
        }

        for (let i = requestedLevel; i < list.length; i++) {
          const candidate = list[i];
          if (!candidate) continue;
          if (disallowed.has(candidate)) continue;
          if (topCategories?.has(candidate)) continue;
          return candidate;
        }

        return null;
      }
      case 'attribute': {
        const attr = product.getAttributeValue(def.source.key);
        if (attr !== undefined) return attr;
        return product.attributes?.[def.source.key]?.value ?? null;
      }
      case 'property': {
        const key = def.source.key;
        if (key === 'brand') return product.brand ?? null;
        if (key === 'season') return product.season ?? null;
        if (key === 'price') return product.price?.value ?? null;
        if (key === 'weight') return product.weight ?? null;
        if ((product as any)[key] !== undefined) return (product as any)[key];
        if (product.meta && (product.meta as any)[key] !== undefined) {
          return (product.meta as any)[key];
        }
        return product.getAttributeValue(key);
      }
      default:
        return null;
    }
  }

  private extractNumericValue(product: Product, def: PivotDimensionDefinition): number | undefined {
    const raw = this.extractRawValue(product, def);
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
    const attr = product.attributes?.[def.source.type === 'attribute' ? def.source.key : ''];
    if (attr && typeof attr.normalizedValue === 'number') return attr.normalizedValue;
    return undefined;
  }

  private formatNumeric(value: number, unit?: string): string {
    if (!Number.isFinite(value)) return NONE_LABEL;
    const abs = Math.abs(value);
    let formatted: string;
    if (abs >= 1000) formatted = value.toFixed(0);
    else if (abs >= 100) formatted = value.toFixed(1);
    else formatted = value.toFixed(2);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  private formatGroupLabel(value: string, dimensionLabel: string): string {
    if (value === UNKNOWN_LABEL) return `${dimensionLabel}: ${UNKNOWN_LABEL}`;
    if (value === NONE_LABEL) return `${dimensionLabel}: ${NONE_LABEL}`;
    return value;
  }

  private sortGroups(groups: Map<string, Product[]>, dimension: GroupDimension): Map<string, Product[]> {
    const keys = Array.from(groups.keys());
    const def = this.dimensionByKey.get(dimension);
    if (this.isNumericDimension(dimension)) {
      const state = this.numericStates.get(dimension);
      return new Map(
        keys
          .sort((a, b) => {
            const bucketA = state?.bucketMap.get(a);
            const bucketB = state?.bucketMap.get(b);
            if (bucketA && bucketB) {
              if (bucketA.min !== bucketB.min) return bucketA.min - bucketB.min;
              if (bucketA.max !== bucketB.max) return bucketA.max - bucketB.max;
            }
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
          })
          .map(key => [key, groups.get(key)!] as [string, Product[]])
      );
    }
    const order = this.dimensionOrder.get(dimension);
    if (order) {
      return new Map(
        keys
          .sort((a, b) => {
            const idxA = order.get(a) ?? Number.MAX_SAFE_INTEGER;
            const idxB = order.get(b) ?? Number.MAX_SAFE_INTEGER;
            if (idxA !== idxB) return idxA - idxB;
            return a.localeCompare(b);
          })
          .map(key => [key, groups.get(key)!] as [string, Product[]])
      );
    }
    if (def?.role === 'category' || def?.role === 'class') {
      return new Map(keys.sort().map(key => [key, groups.get(key)!] as [string, Product[]]));
    }
    return new Map(
      keys
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .map(key => [key, groups.get(key)!] as [string, Product[]])
    );
  }

  private recomputeNumericBuckets(products: Product[], dimension: GroupDimension): void {
    const def = this.dimensionByKey.get(dimension);
    if (!def) return;

    const values = products
      .map(p => this.extractNumericValue(p, def))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    if (!values.length) {
      this.numericStates.delete(dimension);
      return;
    }

    let bucketCount = this.priceBucketCount;
    if (values.length > PRICE_REFINE_THRESHOLD && this.hasFilterFor(dimension)) {
      bucketCount = Math.min(this.priceBucketCount * 2, Math.max(2, Math.ceil(values.length / PRICE_REFINE_THRESHOLD)));
    }

    const buckets = this.buildNumericBuckets(values, def, bucketCount);
    const bucketMap = new Map<string, NumericBucket>();
    buckets.forEach(bucket => bucketMap.set(bucket.label, bucket));
    this.numericStates.set(dimension, {
      buckets,
      bucketMap,
      unit: def.numeric?.unit,
    });
  }

  private buildNumericBuckets(values: number[], def: PivotDimensionDefinition, desiredCount?: number): NumericBucket[] {
    if (!values.length) return [];

    const uniqueCount = new Set(values).size;
    const target = Math.max(1, Math.min(desiredCount ?? this.priceBucketCount, uniqueCount));
    const mode = this.priceBucketMode === 'static' && (!def.numeric?.buckets || target !== this.priceBucketCount)
      ? 'equal-width'
      : this.priceBucketMode;

    switch (mode) {
      case 'static':
        if (def.numeric?.buckets?.length) return def.numeric.buckets;
        return this.computeEqualWidthBuckets(values, target, def.numeric?.unit);
      case 'quantile':
        return this.computeQuantileBuckets(values, target, def.numeric?.unit);
      case 'kmeans':
        return this.computeKMeansBuckets(values, target, def.numeric?.unit);
      case 'equal-width':
      default:
        return this.computeEqualWidthBuckets(values, target, def.numeric?.unit);
    }
  }

  private computeEqualWidthBuckets(values: number[], bucketCount: number, unit?: string): NumericBucket[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (bucketCount <= 1 || min === max) {
      return [{
        label: this.formatRange(min, Infinity, true, unit),
        min,
        max: Infinity,
        inclusiveMax: true,
      }];
    }
    const buckets: NumericBucket[] = [];
    const step = (max - min) / bucketCount;
    let lower = min;
    for (let i = 0; i < bucketCount; i++) {
      const isLast = i === bucketCount - 1;
      const upper = isLast ? Infinity : lower + step;
      buckets.push({
        label: this.formatRange(lower, upper, isLast, unit),
        min: lower,
        max: upper,
        inclusiveMax: isLast,
      });
      lower = upper;
    }
    return buckets;
  }

  private computeQuantileBuckets(values: number[], bucketCount: number, unit?: string): NumericBucket[] {
    const sorted = [...values].sort((a, b) => a - b);
    if (bucketCount <= 1) {
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      return [{
        label: this.formatRange(min, Infinity, true, unit),
        min,
        max: Infinity,
        inclusiveMax: true,
      }];
    }

    const buckets: NumericBucket[] = [];
    const length = sorted.length;
    let startIndex = 0;

    for (let i = 0; i < bucketCount; i++) {
      const targetEnd = i === bucketCount - 1
        ? length - 1
        : Math.floor((length * (i + 1)) / bucketCount) - 1;
      let endIndex = Math.max(startIndex, targetEnd);
      const endValue = sorted[endIndex];

      if (i < bucketCount - 1) {
        while (endIndex + 1 < length && sorted[endIndex + 1] === endValue) {
          endIndex++;
        }
      }

      const min = sorted[startIndex];
      const max = i === bucketCount - 1 ? Infinity : sorted[endIndex + 1] ?? endValue;
      buckets.push({
        label: this.formatRange(min, max, i === bucketCount - 1, unit),
        min,
        max,
        inclusiveMax: i === bucketCount - 1,
      });
      startIndex = endIndex + 1;
    }

    return buckets;
  }

  private computeKMeansBuckets(values: number[], bucketCount: number, unit?: string): NumericBucket[] {
    if (bucketCount <= 1) {
      const min = Math.min(...values);
      return [{
        label: this.formatRange(min, Infinity, true, unit),
        min,
        max: Infinity,
        inclusiveMax: true,
      }];
    }

    const data = [...values].sort((a, b) => a - b);
    let centroids = this.initialiseCentroids(data, bucketCount);
    let assignments = new Array(data.length).fill(0);

    for (let iteration = 0; iteration < 20; iteration++) {
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        let best = 0;
        let bestDist = Math.abs(data[i] - centroids[0]);
        for (let c = 1; c < centroids.length; c++) {
          const dist = Math.abs(data[i] - centroids[c]);
          if (dist < bestDist) {
            bestDist = dist;
            best = c;
          }
        }
        if (assignments[i] !== best) {
          assignments[i] = best;
          changed = true;
        }
      }
      if (!changed) break;
      const newCentroids = new Array(centroids.length).fill(0);
      const counts = new Array(centroids.length).fill(0);
      for (let i = 0; i < data.length; i++) {
        const cluster = assignments[i];
        newCentroids[cluster] += data[i];
        counts[cluster] += 1;
      }
      for (let c = 0; c < centroids.length; c++) {
        if (counts[c] > 0) {
          newCentroids[c] /= counts[c];
        } else {
          newCentroids[c] = centroids[c];
        }
      }
      centroids = newCentroids;
    }

    const clusters: Array<{ min: number; max: number }> = centroids.map(() => ({
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY,
    }));
    for (let i = 0; i < data.length; i++) {
      const cluster = assignments[i];
      clusters[cluster].min = Math.min(clusters[cluster].min, data[i]);
      clusters[cluster].max = Math.max(clusters[cluster].max, data[i]);
    }

    clusters.sort((a, b) => a.min - b.min);
    const buckets: NumericBucket[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const isLast = i === clusters.length - 1;
      const cluster = clusters[i];
      const nextMin = clusters[i + 1]?.min ?? Infinity;
      const upper = isLast ? Infinity : (cluster.max + nextMin) / 2;
      buckets.push({
        label: this.formatRange(cluster.min, upper, isLast, unit),
        min: cluster.min,
        max: upper,
        inclusiveMax: isLast,
      });
    }
    return buckets;
  }

  private initialiseCentroids(values: number[], bucketCount: number): number[] {
    const centroids: number[] = [];
    const step = values.length / bucketCount;
    for (let i = 0; i < bucketCount; i++) {
      const idx = Math.floor(i * step + step / 2);
      centroids.push(values[Math.min(idx, values.length - 1)]);
    }
    return centroids;
  }

  private findBucket(dimension: GroupDimension, value: number): NumericBucket | undefined {
    const state = this.numericStates.get(dimension);
    if (!state) return undefined;
    for (const bucket of state.buckets) {
      const upperOk = bucket.max === Infinity
        ? true
        : bucket.inclusiveMax
          ? value <= bucket.max
          : value < bucket.max;
      if (value >= bucket.min && upperOk) {
        return bucket;
      }
    }
    return undefined;
  }

  private hasFilterFor(dimension: GroupDimension): boolean {
    return this.filterStack.some(f => f.dimension === dimension);
  }

  private formatRange(min: number, max: number, inclusive: boolean, unit?: string): string {
    const toText = (v: number) => {
      if (!Number.isFinite(v)) return '∞';
      if (Math.abs(v) >= 1000) return v.toFixed(0);
      if (Math.abs(v) >= 100) return v.toFixed(1);
      return v.toFixed(2);
    };
    const format = (v: number) => (unit ? `${toText(v)} ${unit}` : toText(v));
    if (!Number.isFinite(max)) {
      return `${format(min)}+`;
    }
    const maxText = format(max);
    if (inclusive) {
      return `${format(min)} – ${maxText}`;
    }
    return `${format(min)} – < ${maxText}`;
  }

  resolveValue(product: Product, dimension: GroupDimension): string {
    return this.getDimensionValue(product, dimension);
  }
}
