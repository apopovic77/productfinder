import type { Product } from '../types/Product';
import { PivotGroup } from '../layout/PivotGroup';

/**
 * Grouping dimension (what to group by)
 */
export type GroupDimension = 'category' | 'subcategory' | 'brand' | 'season' | 'price-range';

export type PriceBucketMode = 'static' | 'equal-width' | 'quantile' | 'kmeans';

export type PriceBucketConfig = {
  mode: PriceBucketMode;
  bucketCount: number;
};

type DrillDownFilter = {
  dimension: GroupDimension;
  value: string;
  priceRange?: { min: number; max: number; inclusiveMax: boolean };
};

type PriceBucket = {
  label: string;
  min: number;
  max: number;
  inclusiveMax: boolean;
  hasPrice: boolean;
  displayMax?: number;
};

/**
 * Drill-down state (current filter path)
 */
export type DrillDownState = {
  dimension: GroupDimension;
  filters: DrillDownFilter[];
};

const DIMENSION_HIERARCHY: GroupDimension[] = [
  'category',
  'subcategory',
  'brand',
  'season',
  'price-range'
];

const CATEGORY_UNKNOWN_LABEL = 'Uncategorized';
const SUBCATEGORY_UNKNOWN_LABEL = 'Other';

/**
 * Service for managing pivot drill-down state and grouping logic
 * OOP design: Encapsulates all drill-down logic
 */
export class PivotDrillDownService {
  private readonly hierarchy = DIMENSION_HIERARCHY;
  private filterStack: DrillDownFilter[] = [];
  private rootDimensionIndex = 0;
  private currentDimensionIndex = 0;
private priceBucketMode: PriceBucketMode = 'static';
private priceBucketCount = 5;
private currentPriceBuckets: PriceBucket[] = [];
private priceBucketMap = new Map<string, PriceBucket>();
private currentCurrency: string | undefined;
private dimensionOrder = new Map<GroupDimension, Map<string, number>>();
  private readonly priceRefineThreshold = 8;

  /**
   * Current grouping dimension (derived from hierarchy + filter depth)
   */
  private currentDimension: GroupDimension = this.hierarchy[this.currentDimensionIndex];
  
  /**
   * Get current grouping dimension
   */
  getDimension(): GroupDimension {
    return this.currentDimension;
  }
  
  /**
   * Set grouping dimension (resets drill-down path)
   */
  setDimension(dimension: GroupDimension): void {
    this.rootDimensionIndex = this.getDimensionIndex(dimension);
    this.currentDimensionIndex = this.rootDimensionIndex;
    this.currentDimension = this.hierarchy[this.currentDimensionIndex];
    this.filterStack = [];
    this.invalidatePriceBuckets();
  }
  
  /**
   * Get current filter stack (breadcrumb path)
   */
  getFilters(): DrillDownFilter[] {
    return this.filterStack.map(f => ({
      dimension: f.dimension,
      value: f.value,
      priceRange: f.priceRange ? { ...f.priceRange } : undefined
    }));
  }
  
  setPriceBucketConfig({ mode, bucketCount }: PriceBucketConfig): void {
    this.priceBucketMode = mode;
    this.priceBucketCount = Math.max(1, bucketCount);
    this.invalidatePriceBuckets();
  }

  setDimensionOrder(dimension: GroupDimension, order: Map<string, number>): void {
    this.dimensionOrder.set(dimension, new Map(order));
  }
  
  setGroupingDimension(dimension: GroupDimension): void {
    const index = this.getDimensionIndex(dimension);
    if (index === this.currentDimensionIndex || index < 0) return;
    if (!this.canUseDimension(dimension)) return;
    this.currentDimensionIndex = index;
    this.currentDimension = this.hierarchy[this.currentDimensionIndex];
    if (this.currentDimension !== 'price-range') {
      this.invalidatePriceBuckets();
    }
  }
  
  /**
   * Can we drill further into the hierarchy?
   */
  canDrillDown(): boolean {
    for (let i = this.currentDimensionIndex + 1; i < this.hierarchy.length; i++) {
      const dim = this.hierarchy[i];
      if (dim === 'subcategory' && !this.hasFilterFor('category')) continue;
      return true;
    }
    return false;
  }
  
  /**
   * Can we drill up to a previous level?
   */
  canDrillUp(): boolean {
    return this.filterStack.length > 0;
  }
  
  /**
   * Peek at the next dimension (if any)
   */
  getNextDimension(): GroupDimension | null {
    for (let i = this.currentDimensionIndex + 1; i < this.hierarchy.length; i++) {
      const dim = this.hierarchy[i];
      if (dim === 'subcategory' && !this.hasFilterFor('category')) continue;
      return dim;
    }
    return null;
  }
  
  /**
   * Drill down into the current group, advancing to the next dimension if possible
   */
  drillDown(value: string): boolean {
    const trimmed = value?.trim();
    if (!trimmed) return false;
    
    const entry: DrillDownFilter = { dimension: this.currentDimension, value: trimmed };
    if (this.currentDimension === 'price-range') {
      const bucket = this.priceBucketMap.get(trimmed);
      if (bucket) {
        entry.priceRange = { min: bucket.min, max: bucket.max, inclusiveMax: bucket.inclusiveMax };
      }
    }
    this.filterStack.push(entry);
    this.invalidatePriceBuckets();
    
    if (this.currentDimension === 'price-range') {
      // Stay on price-range to allow further refinement; ensureMeaningfulDimension will advance if needed
    } else if (this.currentDimensionIndex < this.hierarchy.length - 1) {
      this.currentDimensionIndex += 1;
    }
    
    this.currentDimension = this.hierarchy[this.currentDimensionIndex];
    return true;
  }
  
  /**
   * Drill up (remove last filter) and revert to the previous dimension
   */
  drillUp(): boolean {
    if (!this.filterStack.length) return false;
    
    this.filterStack.pop();
    this.syncDimensionWithStack();
    this.invalidatePriceBuckets();
    return true;
  }
  
  /**
   * Reset to the root level (clear all filters)
   */
  reset(): void {
    this.filterStack = [];
    this.currentDimensionIndex = this.rootDimensionIndex;
    this.currentDimension = this.hierarchy[this.currentDimensionIndex];
    this.invalidatePriceBuckets();
  }
  
  /**
   * Get filtered products based on current drill-down state
   */
  filterProducts(products: Product[]): Product[] {
    let filtered = [...products];
    for (const filter of this.filterStack) {
      filtered = filtered.filter(p => this.matchesFilter(p, filter));
    }
    return filtered;
  }

  private hasFilterFor(dimension: GroupDimension): boolean {
    return this.filterStack.some(f => f.dimension === dimension);
  }

  private getCategoryParts(product: Product): string[] {
    const parts = product.category;
    if (Array.isArray(parts) && parts.length) return parts;
    return [];
  }
  
  private matchesFilter(product: Product, filter: DrillDownFilter): boolean {
    switch (filter.dimension) {
      case 'price-range': {
        const price = product.price?.value;
        if (price === undefined || price === null) return false;
        if (filter.priceRange) {
          const { min, max, inclusiveMax } = filter.priceRange;
          const upperOk = max === Infinity ? true : inclusiveMax ? price <= max : price < max;
          return price >= min && upperOk;
        }
        return this.getDimensionValue(product, 'price-range') === filter.value;
      }
      case 'subcategory': {
        const subValue = this.getDimensionValue(product, 'subcategory');
        return subValue === filter.value;
      }
      default:
        return this.getDimensionValue(product, filter.dimension) === filter.value;
    }
  }
  
  /**
   * Group products by current dimension
   * IMPORTANT: Groups FILTERED products (after drill-down)
  */
  groupProducts(products: Product[]): Map<string, Product[]> {
    const filtered = this.filterProducts(products);
    if (filtered.length === 0) {
      this.invalidatePriceBuckets();
      return new Map();
    }

    this.ensureMeaningfulDimension(filtered);

    if (this.currentDimension === 'price-range') {
      this.recomputePriceBuckets(filtered);
    } else {
      this.currentPriceBuckets = [];
      this.priceBucketMap.clear();
    }
    let groups = new Map<string, Product[]>();

    for (const product of filtered) {
      const key = this.getDimensionValue(product, this.currentDimension);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(product);
    }

    const order = this.dimensionOrder.get(this.currentDimension);
    if (order) {
      const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
        const idxA = order.get(a) ?? Number.MAX_SAFE_INTEGER;
        const idxB = order.get(b) ?? Number.MAX_SAFE_INTEGER;
        return idxA - idxB || a.localeCompare(b);
      });
      const ordered = new Map<string, Product[]>();
      for (const key of orderedKeys) {
        ordered.set(key, groups.get(key)!);
      }
      groups = ordered;
    }

    return groups;
  }
  
  /**
  * Resolve the current grouping key for a product (used by the layouter)
  */
  getGroupKey(product: Product): string {
    return this.getDimensionValue(product, this.currentDimension);
  }
  
  /**
   * Create PivotGroup hierarchy from products
   */
  createGroups(products: Product[]): PivotGroup[] {
    const groups = this.groupProducts(products);
    const result: PivotGroup[] = [];
    const sortedKeys = this.sortKeysForDimension(Array.from(groups.keys()), this.currentDimension);

    for (const key of sortedKeys) {
      result.push(new PivotGroup(
        key,
        this.formatGroupLabel(key, this.currentDimension),
        this.filterStack.length
      ));
    }
    
    return result;
  }
  
  /**
   * Get breadcrumb path for UI
   */
  getBreadcrumbs(): string[] {
    return ['All', ...this.filterStack.map(filter => filter.value)];
  }
  
  /**
   * Get current state
   */
  getState(): DrillDownState {
    return {
      dimension: this.hierarchy[this.rootDimensionIndex],
      filters: this.getFilters()
    };
  }
  
  /**
   * Restore state
   */
  setState(state: DrillDownState): void {
    this.rootDimensionIndex = this.getDimensionIndex(state.dimension);
    this.filterStack = state.filters.map(f => ({
      dimension: f.dimension,
      value: f.value,
      priceRange: f.priceRange ? { ...f.priceRange } : undefined
    }));
    this.syncDimensionWithStack();
    this.invalidatePriceBuckets();
  }
  
  /**
   * Extract value from product for a given dimension
   */
  private getDimensionValue(product: Product, dimension: GroupDimension): string {
    switch (dimension) {
      case 'category':
        return this.getCategoryParts(product)[0] || CATEGORY_UNKNOWN_LABEL;
      case 'subcategory': {
        const metaSource = (product as any).meta?.source;
        if (typeof metaSource === 'string' && metaSource.length) {
          return metaSource.toUpperCase();
        }
        const parts = this.getCategoryParts(product);
        const top = parts[0];
        const remainder = parts.filter(part => part !== top);
        if (remainder.length === 0) {
          return SUBCATEGORY_UNKNOWN_LABEL;
        }
        return remainder[0];
      }
      
      case 'brand':
        return product.brand || 'Unknown';
      
      case 'season':
        return product.season ? `${product.season}` : 'No Season';
      
      case 'price-range': {
        const price = product.price?.value;
        if (price === undefined || price === null || !isFinite(price)) {
          return 'No Price';
        }
        const bucket = this.findPriceBucket(price);
        return bucket?.label ?? this.formatPriceRange(price, undefined, true, this.currentCurrency);
      }
    }
  }
  
  private findPriceBucket(value: number): PriceBucket | undefined {
    for (const bucket of this.currentPriceBuckets) {
      if (!bucket.hasPrice) continue;
      const upperOk = bucket.max === Infinity
        ? true
        : bucket.inclusiveMax ? value <= bucket.max : value < bucket.max;
      if (value >= bucket.min && upperOk) {
        return bucket;
      }
    }
    return undefined;
  }
  
  private recomputePriceBuckets(products: Product[]): void {
    const { buckets, currency } = this.buildPriceBuckets(products);
    this.currentPriceBuckets = buckets;
    this.priceBucketMap.clear();
    const order = new Map<string, number>();
    let orderIndex = 0;
    for (const bucket of buckets) {
      if (bucket.hasPrice) {
        this.priceBucketMap.set(bucket.label, bucket);
        order.set(bucket.label, orderIndex++);
      }
    }
    if (order.size) {
      this.setDimensionOrder('price-range', order);
    }
    this.currentCurrency = currency;
  }
  
  private buildPriceBuckets(products: Product[]): { buckets: PriceBucket[]; currency?: string } {
    const buckets: PriceBucket[] = [];
    const numericPrices: number[] = [];
    let currency: string | undefined;
    let hasNoPrice = false;
    
    for (const product of products) {
      const value = product.price?.value;
      if (value === undefined || value === null || !isFinite(value)) {
        hasNoPrice = true;
        continue;
      }
      numericPrices.push(value);
      if (!currency && product.price?.currency) {
        currency = product.price.currency;
      }
    }
    
    if (numericPrices.length === 0) {
      if (hasNoPrice) {
        buckets.push(this.createNoPriceBucket());
      }
      return { buckets, currency };
    }
    
    let priceBuckets = this.computePriceBuckets(numericPrices, currency);

    if (this.hasFilterFor('price-range') && numericPrices.length > this.priceRefineThreshold) {
      const desired = Math.min(
        Math.max(2, Math.ceil(numericPrices.length / this.priceRefineThreshold)),
        this.priceBucketCount * 2
      );
      priceBuckets = this.computePriceBuckets(numericPrices, currency, desired);
    }
    buckets.push(...priceBuckets);
    if (hasNoPrice) {
      buckets.push(this.createNoPriceBucket());
    }
    return { buckets, currency };
  }
  
  private computePriceBuckets(values: number[], currency?: string, desiredCount?: number): PriceBucket[] {
    const uniqueCount = new Set(values).size;
    const target = Math.max(1, Math.min(desiredCount ?? this.priceBucketCount, uniqueCount));
    const mode = this.priceBucketMode === 'static' && desiredCount && desiredCount > this.priceBucketCount
      ? 'equal-width'
      : this.priceBucketMode;
    switch (mode) {
      case 'equal-width':
        return this.computeEqualWidthBuckets(values, target, currency);
      case 'quantile':
        return this.computeQuantileBuckets(values, target, currency);
      case 'kmeans':
        return this.computeKMeansBuckets(values, target, currency);
      case 'static':
      default:
        return this.computeStaticBuckets(currency);
    }
  }
  
  private computeStaticBuckets(currency?: string): PriceBucket[] {
    const thresholds = [50, 100, 200, 500];
    const buckets: PriceBucket[] = [];
    let lower = 0;
    for (const threshold of thresholds) {
      buckets.push(this.createBucket(lower, threshold, false, currency, threshold));
      lower = threshold;
    }
    buckets.push(this.createBucket(lower, Infinity, true, currency));
    return buckets;
  }
  
  private computeEqualWidthBuckets(values: number[], bucketCount: number, currency?: string): PriceBucket[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (bucketCount <= 1 || min === max) {
      return [this.createBucket(min, Infinity, true, currency, max)];
    }
    const buckets: PriceBucket[] = [];
    const step = (max - min) / bucketCount;
    let lower = min;
    for (let i = 0; i < bucketCount; i++) {
      const upper = i === bucketCount - 1 ? Infinity : lower + step;
      const inclusive = i === bucketCount - 1;
      const displayMax = inclusive ? max : upper;
      buckets.push(this.createBucket(lower, upper, inclusive, currency, displayMax));
      lower = upper;
    }
    return buckets;
  }
  
  private computeQuantileBuckets(values: number[], bucketCount: number, currency?: string): PriceBucket[] {
    const sorted = [...values].sort((a, b) => a - b);
    if (bucketCount <= 1) {
      return [this.createBucket(sorted[0], Infinity, true, currency, sorted[sorted.length - 1])];
    }
    
    const buckets: PriceBucket[] = [];
    let startIndex = 0;
    const length = sorted.length;
    
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
      } else {
        endIndex = length - 1;
      }
      
      const lower = sorted[startIndex];
      const nextStart = endIndex + 1 < length ? sorted[endIndex + 1] : sorted[length - 1];
      const upper = i === bucketCount - 1 ? Infinity : nextStart;
      const inclusive = i === bucketCount - 1;
      const displayMax = inclusive ? sorted[endIndex] : sorted[endIndex];
      buckets.push(this.createBucket(lower, upper, inclusive, currency, displayMax));
      startIndex = endIndex + 1;
      if (startIndex >= length) break;
    }
    
    return buckets;
  }
  
  private computeKMeansBuckets(values: number[], bucketCount: number, currency?: string): PriceBucket[] {
    const sorted = [...values].sort((a, b) => a - b);
    if (bucketCount <= 1) {
      return [this.createBucket(sorted[0], Infinity, true, currency, sorted[sorted.length - 1])];
    }
    
    let k = bucketCount;
    let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor((sorted.length - 1) * (i + 0.5) / k)]);
    let assignments = new Array(sorted.length).fill(0);
    
    for (let iteration = 0; iteration < 30; iteration++) {
      let changed = false;
      
      for (let idx = 0; idx < sorted.length; idx++) {
        const value = sorted[idx];
        let bestCluster = 0;
        let bestDistance = Math.abs(value - centers[0]);
        for (let c = 1; c < centers.length; c++) {
          const distance = Math.abs(value - centers[c]);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCluster = c;
          }
        }
        if (assignments[idx] !== bestCluster) {
          assignments[idx] = bestCluster;
          changed = true;
        }
      }
      
      const sums = new Array(centers.length).fill(0);
      const counts = new Array(centers.length).fill(0);
      for (let idx = 0; idx < sorted.length; idx++) {
        const cluster = assignments[idx];
        sums[cluster] += sorted[idx];
        counts[cluster] += 1;
      }
      
      const newCenters: number[] = [];
      const clusterIndexMap = new Map<number, number>();
      for (let c = 0; c < centers.length; c++) {
        if (counts[c] > 0) {
          newCenters.push(sums[c] / counts[c]);
          clusterIndexMap.set(c, newCenters.length - 1);
        }
      }
      
      if (newCenters.length === centers.length && !changed) {
        centers = newCenters;
        break;
      }
      
      centers = newCenters;
      assignments = assignments.map(cluster => clusterIndexMap.get(cluster) ?? 0);
      k = centers.length;
      if (k === 0) {
        centers = [sorted.reduce((acc, v) => acc + v, 0) / sorted.length];
        assignments = new Array(sorted.length).fill(0);
        k = 1;
        break;
      }
    }
    
    const clusters: number[][] = Array.from({ length: k }, () => []);
    for (let idx = 0; idx < sorted.length; idx++) {
      clusters[assignments[idx]].push(sorted[idx]);
    }
    const populated = clusters.filter(cluster => cluster.length > 0).sort((a, b) => a[0] - b[0]);
    return this.buildBucketsFromClusters(populated, currency);
  }
  
  private buildBucketsFromClusters(clusters: number[][], currency?: string): PriceBucket[] {
    const buckets: PriceBucket[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const values = clusters[i].sort((a, b) => a - b);
      const lower = values[0];
      const maxValue = values[values.length - 1];
      const nextMin = i < clusters.length - 1 ? clusters[i + 1][0] : maxValue;
      const upper = i === clusters.length - 1 ? Infinity : (maxValue + nextMin) / 2;
      const inclusive = i === clusters.length - 1;
      const displayMax = inclusive ? maxValue : maxValue;
      buckets.push(this.createBucket(lower, upper, inclusive, currency, displayMax));
    }
    return buckets;
  }
  
  private createBucket(min: number, max: number, inclusive: boolean, currency?: string, displayMax?: number): PriceBucket {
    const label = this.formatPriceRange(min, displayMax ?? (inclusive || max === Infinity ? max : max), inclusive || max === Infinity, currency);
    return {
      label,
      min,
      max,
      inclusiveMax: inclusive || max === Infinity,
      hasPrice: true,
      displayMax: displayMax
    };
  }
  
  private createNoPriceBucket(): PriceBucket {
    return {
      label: 'No Price',
      min: 0,
      max: 0,
      inclusiveMax: true,
      hasPrice: false
    };
  }
  
  private formatPriceRange(min: number, displayMax: number | undefined, inclusive: boolean, currency?: string): string {
    const format = this.formatPrice.bind(this, currency);
    const minText = format(min);
    
    if (displayMax === undefined || displayMax === Infinity) {
      return `${minText}+`;
    }
    
    if (Math.abs(displayMax - min) < 0.01) {
      return minText;
    }
    
    const maxText = format(displayMax);
    if (inclusive) {
      return `${minText} - ${maxText}`;
    }
    return `${minText} - <${maxText}`;
  }
  
  private formatPrice(currency: string | undefined, value: number): string {
    if (!isFinite(value)) {
      return '∞';
    }
    if (currency) {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: value >= 100 ? 0 : 2
      }).format(value);
    }
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 100) / 100;
    return `€${rounded}`;
  }
  
  private invalidatePriceBuckets(): void {
    this.currentPriceBuckets = [];
    this.priceBucketMap.clear();
    this.currentCurrency = undefined;
  }
  
  private ensureMeaningfulDimension(products: Product[]): void {
    if (!products.length) return;
    let index = this.currentDimensionIndex;
    while (index < this.hierarchy.length - 1) {
      const dimension = this.hierarchy[index];
      if (dimension === 'subcategory' && !this.hasFilterFor('category')) {
        index++;
        continue;
      }
      const distinct = this.countDistinctValues(products, dimension);
      if (distinct > 1) break;
      index++;
    }
    if (index !== this.currentDimensionIndex) {
      this.currentDimensionIndex = index;
      this.currentDimension = this.hierarchy[index];
      if (this.currentDimension !== 'price-range') {
        this.invalidatePriceBuckets();
      }
    }
  }
  
  private countDistinctValues(products: Product[], dimension: GroupDimension): number {
    if (!products.length) return 0;
    if (dimension === 'price-range') {
      const { buckets } = this.buildPriceBuckets(products);
      return buckets.length;
    }
    const values = new Set<string>();
    for (const product of products) {
      values.add(this.getDimensionValue(product, dimension));
    }
    return values.size;
  }
  
  /**
   * Format group label for display
   */
  private formatGroupLabel(key: string, dimension: GroupDimension): string {
    switch (dimension) {
      case 'season':
        return `Season ${key}`;
      case 'price-range':
        return key;
      default:
        return key;
    }
  }
  
  private sortKeysForDimension(keys: string[], dimension: GroupDimension): string[] {
    if (dimension === 'price-range') {
      return keys.sort((a, b) => {
        const bucketA = this.priceBucketMap.get(a);
        const bucketB = this.priceBucketMap.get(b);
        if (bucketA && bucketB) {
          if (bucketA.min !== bucketB.min) return bucketA.min - bucketB.min;
          if (bucketA.max !== bucketB.max) return bucketA.max - bucketB.max;
        } else if (bucketA) {
          return -1;
        } else if (bucketB) {
          return 1;
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    const order = this.dimensionOrder.get(dimension);
    if (!order) {
      return keys.sort((a, b) => a.localeCompare(b));
    }
    return keys.sort((a, b) => {
      const idxA = order.get(a) ?? Number.MAX_SAFE_INTEGER;
      const idxB = order.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) return idxA - idxB;
      return a.localeCompare(b);
    });
  }
  
  /**
   * Synchronise current dimension with the drill-down stack/root dimension
   */
  private syncDimensionWithStack(): void {
    if (!this.filterStack.length) {
      this.currentDimensionIndex = this.rootDimensionIndex;
    } else {
      const lastFilter = this.filterStack[this.filterStack.length - 1];
      const lastIndex = this.getDimensionIndex(lastFilter.dimension);
      this.currentDimensionIndex = Math.min(lastIndex + 1, this.hierarchy.length - 1);
    }
    this.currentDimension = this.hierarchy[this.currentDimensionIndex];
  }
  
  private getDimensionIndex(dimension: GroupDimension): number {
    const idx = this.hierarchy.indexOf(dimension);
    return idx >= 0 ? idx : 0;
  }
  
  getHierarchy(): GroupDimension[] {
    return [...this.hierarchy];
  }

  canUseDimension(dimension: GroupDimension): boolean {
    if (dimension === 'subcategory') {
      return this.hasFilterFor('category');
    }
    return true;
  }

  getAvailableDimensions(products: Product[]): GroupDimension[] {
    const filtered = this.filterProducts(products);
    const available: GroupDimension[] = [];
    for (const dimension of this.hierarchy) {
      if (!this.canUseDimension(dimension)) continue;
      if (this.countDistinctValues(filtered, dimension) > 1) {
        available.push(dimension);
      }
    }
    return available;
  }
}
