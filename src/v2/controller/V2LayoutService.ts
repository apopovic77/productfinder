/**
 * V2 Layout Service
 *
 * Orchestrates GPANE Engine → PivotLayouter → LayoutItem[] for GPU rendering.
 * Reuses v1's core classes but outputs LayoutItem[] instead of driving a Canvas.
 */
import type { Product } from '../../types/Product';
import type { Bucket } from '../../gpane/types';
import type { PivotDimensionDefinition } from '../../services/PivotDimensionAnalyzer';
import { GpanePivotService } from '../../gpane/GpanePivotService';
import { PivotDimensionAnalyzer } from '../../services/PivotDimensionAnalyzer';
import { LayoutEngine } from '../../layout/LayoutEngine';
import { PivotLayouter } from '../../layout/PivotLayouter';
import { WeightScalePolicy } from '../../layout/ScalePolicy';
import type { LayoutNode } from '../../layout/LayoutNode';
import { ONEAL_TAXONOMY } from '../../gpane/oneal-taxonomy';
import { ACTIVE_PIVOT_PROFILE } from '../../config/pivot';
import type { LayoutItem } from '../render/PivotLayoutAdapter';

export interface NavigationState {
  breadcrumbs: string[];
  activeDimension: string | null;
  availableDimensions: PivotDimensionDefinition[];
  heroMode: boolean;
  buckets: Bucket[];
  mode: 'taxonomy' | 'gpane';
}

export class V2LayoutService {
  private pivotService: GpanePivotService;
  private pivotAnalyzer: PivotDimensionAnalyzer;
  private layoutEngine: LayoutEngine<Product>;
  private pivotLayouter: PivotLayouter<Product>;
  private products: Product[] = [];
  private _familyGrouped = false;
  private _familyMap = new Map<string, Product[]>();

  constructor() {
    this.pivotService = new GpanePivotService({
      maxBuckets: 12,
      minCoverage: 0.5,
      heroThreshold: ACTIVE_PIVOT_PROFILE.heroThreshold,
      scoring: {
        coverage: 0.25,
        diversity: 0.25,
        informationGain: 0.20,
        usability: 0.15,
        redundancy: 0.10,
        history: 0.03,
        fragmentation: 0.02,
      },
      overrides: {},
      hierarchies: [],
      domain: 'oneal',
      taxonomy: ONEAL_TAXONOMY,
    });

    this.pivotAnalyzer = new PivotDimensionAnalyzer();

    this.pivotLayouter = new PivotLayouter<Product>({
      orientation: 'columns',
      flow: 'ltr',
      frameGap: 12,
      framePadding: 8,
      itemGap: 4,
      innerLayoutType: 'shelf',
      groupKey: (p) => this.pivotService.getGroupKey(p),
      groupSort: (a, b) => this.pivotService.getGroupComparator()(a, b),
      access: { weight: () => undefined },
      scale: new WeightScalePolicy(),
    });

    this.layoutEngine = new LayoutEngine<Product>(this.pivotLayouter);
  }

  init(products: Product[]): void {
    this.products = products;

    // Analyze dimensions for the UI picker
    const analysis = this.pivotAnalyzer.analyze(products);
    this.pivotService.setModel(analysis);

    // Load into GPANE
    this.pivotService.forceReload(products);
  }

  computeLayout(width: number, height: number, clickOrigin?: { x: number; y: number }): LayoutItem[] {
    let filtered = this.pivotService.filterProducts(this.products);

    // Apply family grouping
    if (this._familyGrouped) {
      filtered = this._collapseByFamily(filtered);
    }

    // Rebuild layouter with fresh config (PivotLayouter.config is private)
    const isMobile = width < 768;
    this.pivotLayouter = new PivotLayouter<Product>({
      orientation: isMobile ? 'rows' : 'columns',
      flow: 'ltr',
      frameGap: isMobile ? 6 : 12,
      framePadding: 8,
      itemGap: isMobile ? 3 : 4,
      innerLayoutType: 'shelf',
      groupKey: (p) => this.pivotService.getGroupKey(p),
      groupSort: (a, b) => this.pivotService.getGroupComparator()(a, b),
      access: { weight: () => undefined },
      scale: new WeightScalePolicy(),
    });
    this.layoutEngine.setLayouter(this.pivotLayouter);

    // Sync products with layout engine (node pooling)
    this.layoutEngine.sync(filtered, (p) => p.id);

    // Compute layout positions
    this.layoutEngine.layout({ width, height });

    // Convert LayoutNodes to LayoutItems
    const nodes = this.layoutEngine.all();
    return this._nodesToLayoutItems(nodes, clickOrigin);
  }

  drillDown(bucketLabel: string): void {
    this.pivotService.drillDown(bucketLabel);
  }

  drillUp(): void {
    this.pivotService.drillUp();
  }

  reset(): void {
    this.pivotService.reset();
  }

  setDimension(key: string): void {
    this.pivotService.setDimension(key);
  }

  setFamilyGrouped(enabled: boolean): void {
    this._familyGrouped = enabled;
  }

  getNavigationState(): NavigationState {
    return {
      breadcrumbs: this.pivotService.getBreadcrumbs(),
      activeDimension: this.pivotService.getDimension(),
      availableDimensions: this.pivotService.getDimensionDefinitions(),
      heroMode: this.pivotService.isHeroModeActive(),
      buckets: this.pivotService.gpaneEngine.buckets,
      mode: this.pivotService.mode === 'taxonomy' ? 'taxonomy' : 'gpane',
    };
  }

  getGroupHeaders(): Array<{ key: string; label: string; x: number; y: number; width: number; height: number }> {
    return this.pivotLayouter.getGroupHeaders?.() || [];
  }

  getProductById(id: string): Product | undefined {
    return this.products.find(p => p.id === id);
  }

  private _nodesToLayoutItems(nodes: LayoutNode<Product>[], clickOrigin?: { x: number; y: number }): LayoutItem[] {
    const items: LayoutItem[] = [];
    let atlasIndex = 0;

    // Build a product→atlasIndex map to keep stable atlas assignments
    for (const node of nodes) {
      const product = node.data as Product;
      const storageId = product.primaryImage?.storage_id;

      items.push({
        id: node.id,
        posX: node.posX.targetValue ?? 0,
        posY: -(node.posY.targetValue ?? 0), // Flip Y: canvas Y-down → Three.js Y-up
        width: node.width.targetValue ?? 60,
        height: node.height.targetValue ?? 60,
        opacity: node.opacity.targetValue ?? 1,
        atlasIndex: atlasIndex++,
        storageId: storageId,
      });
    }

    return items;
  }

  private _collapseByFamily(products: Product[]): Product[] {
    this._familyMap.clear();
    for (const p of products) {
      const group = (p.raw as any)?.design_group || p.getAttributeValue<string>('product_code') || p.id;
      if (!this._familyMap.has(group)) {
        this._familyMap.set(group, []);
      }
      this._familyMap.get(group)!.push(p);
    }

    const representatives: Product[] = [];
    for (const [, family] of this._familyMap) {
      const withImage = family.find(p => p.primaryImage?.storage_id);
      representatives.push(withImage || family[0]);
    }
    return representatives;
  }
}
