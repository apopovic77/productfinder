import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductLayoutAccessors, ProductRenderAccessors } from './layout/Accessors';
import { WeightScalePolicy } from './layout/ScalePolicy';
import { GridLayoutStrategy } from './layout/GridLayoutStrategy';
import { PivotLayouter, type PivotConfig } from './layout/PivotLayouter';
import { LayoutEngine } from './layout/LayoutEngine';
import { CanvasRenderer } from './render/CanvasRenderer';
import { SkeletonRenderer } from './render/SkeletonRenderer';
import { ViewportTransform } from './utils/ViewportTransform';
import { FavoritesStorage } from './utils/FavoritesStorage';
import { fetchProducts } from './data/ProductRepository';
import { ProductModal } from './components/ProductModal';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type LayoutMode = 'grid' | 'list' | 'compact' | 'large';
type SortMode = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'weight-asc' | 'weight-desc' | 'season-desc' | 'none';

type State = {
  loading: boolean;
  error: string | null;
  products: Product[];
  search: string;
  category: string;
  season: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
  selectedProduct: Product | null;
  hoveredProduct: Product | null;
  mousePos: { x: number; y: number } | null;
  focusedIndex: number;
  layoutMode: LayoutMode;
  sortMode: SortMode;
  showOnlyFavorites: boolean;
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private renderer: CanvasRenderer<Product> | null = null;
  private skeletonRenderer: SkeletonRenderer | null = null;
  private skeletonRafId: number | null = null;
  private viewport: ViewportTransform | null = null;
  private engine: LayoutEngine<Product> | null = null;
  private layouter: PivotLayouter<Product> | null = null;
  private access = new ProductLayoutAccessors();
  private renderAccess = new ProductRenderAccessors();
  private scalePolicy = new WeightScalePolicy();
  private favorites = new FavoritesStorage();

  state: State = {
    loading: true,
    error: null,
    products: [],
    search: '',
    category: '',
    season: '',
    priceMin: '',
    priceMax: '',
    weightMin: '',
    weightMax: '',
    selectedProduct: null,
    hoveredProduct: null,
    mousePos: null,
    focusedIndex: -1,
    layoutMode: 'grid',
    sortMode: 'none',
    showOnlyFavorites: false,
  };

  private getLayoutConfig(): PivotConfig<Product> {
    const { layoutMode } = this.state;
    
    switch (layoutMode) {
      case 'list':
        return {
          orientation: 'rows', flow: 'ltr',
          groupKey: () => 'all',
          frameGap: 12, framePadding: 12, itemGap: 12, rowBaseHeight: 180,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'compact':
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 12, framePadding: 8, itemGap: 8, rowBaseHeight: 80,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'large':
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 32, framePadding: 20, itemGap: 20, rowBaseHeight: 200,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
      case 'grid':
      default:
        return {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 24, framePadding: 12, itemGap: 12, rowBaseHeight: 120,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
    }
  }

  async componentDidMount() {
    // Initialize canvas first
    const canvas = this.canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Initialize viewport transform
        this.viewport = new ViewportTransform(canvas);
        
        // Initialize skeleton renderer
        this.skeletonRenderer = new SkeletonRenderer(ctx);
        this.startSkeletonAnimation();
        
        const config = this.getLayoutConfig();
        this.layouter = new PivotLayouter<Product>(config);
        this.engine = new LayoutEngine<Product>(this.layouter);
        this.renderer = new CanvasRenderer<Product>(ctx, () => this.engine!.all(), this.renderAccess, this.viewport);
        // Don't start renderer yet - wait for products to load
        
        window.addEventListener('resize', this.handleResize);
        canvas.addEventListener('click', this.handleCanvasClick);
        canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
        canvas.addEventListener('mouseleave', this.handleCanvasMouseLeave);
        
        // Set initial canvas size
        requestAnimationFrame(() => {
          this.handleResize();
        });
      }
    }
    
    // Keyboard navigation
    document.addEventListener('keydown', this.handleKeyDown);

    // Load products
    try {
      const results = await fetchProducts({ limit: 1000 });
      this.setState({ products: results || [], loading: false }, () => {
        // Stop skeleton and start real renderer
        this.stopSkeletonAnimation();
        if (this.renderer) this.renderer.start();
        
        // Trigger layout after products are loaded
        if (this.engine && canvas) {
          this.engine.sync(this.filteredProducts, p => p.id);
          this.engine.layout({ width: canvas.clientWidth, height: canvas.clientHeight });
        }
      });
    } catch (e: any) {
      this.stopSkeletonAnimation();
      this.setState({ error: e.message || 'Load error', loading: false });
    }
  }

  componentWillUnmount(): void {
    if (this.renderer) this.renderer.stop();
    if (this.viewport) this.viewport.destroy();
    this.stopSkeletonAnimation();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('click', this.handleCanvasClick);
      canvas.removeEventListener('mousemove', this.handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', this.handleCanvasMouseLeave);
    }
  }
  
  private startSkeletonAnimation = () => {
    if (!this.skeletonRenderer) return;
    const loop = () => {
      if (this.skeletonRenderer && this.state.loading) {
        this.skeletonRenderer.draw(20);
        this.skeletonRafId = requestAnimationFrame(loop);
      }
    };
    loop();
  };
  
  private stopSkeletonAnimation = () => {
    if (this.skeletonRafId !== null) {
      cancelAnimationFrame(this.skeletonRafId);
      this.skeletonRafId = null;
    }
  };

  componentDidUpdate(prevProps: {}, prevState: State): void {
    if (!this.engine) return;
    
    // Rebuild layouter if layout mode changed
    if (prevState.layoutMode !== this.state.layoutMode && this.layouter) {
      const config = this.getLayoutConfig();
      this.layouter = new PivotLayouter<Product>(config);
      this.engine = new LayoutEngine<Product>(this.layouter);
      const c = this.canvasRef.current;
      this.engine.sync(this.filteredProducts, p => p.id);
      if (c) this.engine.layout({ width: c.clientWidth, height: c.clientHeight });
      return;
    }
    
    if (
      prevState.products !== this.state.products ||
      prevState.search !== this.state.search ||
      prevState.category !== this.state.category ||
      prevState.season !== this.state.season ||
      prevState.priceMin !== this.state.priceMin ||
      prevState.priceMax !== this.state.priceMax ||
      prevState.weightMin !== this.state.weightMin ||
      prevState.weightMax !== this.state.weightMax ||
      prevState.sortMode !== this.state.sortMode ||
      prevState.showOnlyFavorites !== this.state.showOnlyFavorites
    ) {
      this.engine.sync(this.filteredProducts, p => p.id);
      const c = this.canvasRef.current;
      if (c) this.engine.layout({ width: c.clientWidth, height: c.clientHeight });
    }
    
    // Update renderer hover state
    if (prevState.hoveredProduct !== this.state.hoveredProduct && this.renderer) {
      this.renderer.hoveredItem = this.state.hoveredProduct;
    }
    
    // Update renderer focus state
    if (prevState.focusedIndex !== this.state.focusedIndex && this.renderer) {
      const filtered = this.filteredProducts;
      this.renderer.focusedItem = this.state.focusedIndex >= 0 && this.state.focusedIndex < filtered.length 
        ? filtered[this.state.focusedIndex] 
        : null;
    }
  }

  private handleResize = () => {
    const c = this.canvasRef.current;
    if (!c || !c.parentElement) return;
    
    // Get dimensions from parent element since canvas is a replaced element
    const parent = c.parentElement;
    const width = parent.clientWidth || window.innerWidth;
    const height = parent.clientHeight || window.innerHeight;
    
    c.width = width;
    c.height = height;
    if (this.engine) this.engine.layout({ width, height });
  };

  private handleCanvasClick = (e: MouseEvent) => {
    if (!this.engine) return;
    
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    
    // Transform to world coordinates
    if (this.viewport) {
      const worldPos = this.viewport.screenToWorld(x, y);
      x = worldPos.x;
      y = worldPos.y;
    }
    
    // Hit test: find clicked product
    const nodes = this.engine.all();
    for (const node of nodes) {
      const nx = node.posX.value ?? 0;
      const ny = node.posY.value ?? 0;
      const nw = node.width.value ?? 0;
      const nh = node.height.value ?? 0;
      
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) {
        this.setState({ selectedProduct: node.data });
        return;
      }
    }
  };

  private handleCanvasMouseMove = (e: MouseEvent) => {
    if (!this.engine) return;
    
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    
    // Transform to world coordinates
    if (this.viewport) {
      const worldPos = this.viewport.screenToWorld(x, y);
      x = worldPos.x;
      y = worldPos.y;
    }
    
    // Hit test: find hovered product
    const nodes = this.engine.all();
    let found: Product | null = null;
    
    for (const node of nodes) {
      const nx = node.posX.value ?? 0;
      const ny = node.posY.value ?? 0;
      const nw = node.width.value ?? 0;
      const nh = node.height.value ?? 0;
      
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) {
        found = node.data;
        break;
      }
    }
    
    if (found !== this.state.hoveredProduct) {
      this.setState({ 
        hoveredProduct: found,
        mousePos: found ? { x: e.clientX, y: e.clientY } : null
      });
      canvas.style.cursor = found ? 'pointer' : 'default';
    } else if (found) {
      this.setState({ mousePos: { x: e.clientX, y: e.clientY } });
    }
  };

  private handleCanvasMouseLeave = () => {
    const canvas = this.canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
    this.setState({ hoveredProduct: null, mousePos: null });
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Don't handle if modal is open or typing in input
    if (this.state.selectedProduct || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
      return;
    }

    const filtered = this.filteredProducts;
    if (filtered.length === 0) return;

    const { focusedIndex } = this.state;
    let newIndex = focusedIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, filtered.length - 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = focusedIndex < 0 ? 0 : Math.max(focusedIndex - 1, 0);
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = filtered.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filtered.length) {
          this.setState({ selectedProduct: filtered[focusedIndex] });
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      this.setState({ focusedIndex: newIndex });
    }
  };

  private sortProducts(products: Product[]): Product[] {
    const { sortMode } = this.state;
    if (sortMode === 'none') return products;
    
    const sorted = [...products];
    
    switch (sortMode) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        sorted.sort((a, b) => (a.price?.value ?? 0) - (b.price?.value ?? 0));
        break;
      case 'price-desc':
        sorted.sort((a, b) => (b.price?.value ?? 0) - (a.price?.value ?? 0));
        break;
      case 'weight-asc':
        sorted.sort((a, b) => (a.specifications?.weight ?? 0) - (b.specifications?.weight ?? 0));
        break;
      case 'weight-desc':
        sorted.sort((a, b) => (b.specifications?.weight ?? 0) - (a.specifications?.weight ?? 0));
        break;
      case 'season-desc':
        sorted.sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
        break;
    }
    
    return sorted;
  }

  private get filteredProducts(): Product[] {
    const { products, search, category, season, priceMin, priceMax, weightMin, weightMax, showOnlyFavorites } = this.state;
    const filtered = products.filter(p => {
      // Favorites filter
      if (showOnlyFavorites && !this.favorites.isFavorite(p.id)) return false;
      
      const q = search.trim().toLowerCase();
      if (q) {
        const inName = p.name.toLowerCase().includes(q);
        const inCat = p.category?.some(c => c.toLowerCase().includes(q));
        if (!inName && !inCat) return false;
      }
      if (category && !p.category?.includes(category)) return false;
      if (season && p.season != Number(season)) return false;

      const pv = p.price?.value;
      if (priceMin && (pv === undefined || pv < Number(priceMin))) return false;
      if (priceMax && (pv === undefined || pv > Number(priceMax))) return false;

      const w = p.specifications?.weight;
      if (weightMin && (w === undefined || w < Number(weightMin))) return false;
      if (weightMax && (w === undefined || w > Number(weightMax))) return false;
      return true;
    });
    
    return this.sortProducts(filtered);
  }

  private uniqueCategories(products: Product[]): string[] {
    const s = new Set<string>();
    products.forEach(p => p.category?.forEach(c => s.add(c)));
    return Array.from(s).sort();
  }

  private uniqueSeasons(products: Product[]): number[] {
    const s = new Set<number>();
    products.forEach(p => { if (p.season) s.add(p.season); });
    return Array.from(s).sort((a, b) => b - a);
  }

  render() {
    const { loading, error, search, category, season, priceMin, priceMax, weightMin, weightMax, selectedProduct, hoveredProduct, mousePos } = this.state;
    const cats = this.uniqueCategories(this.state.products);
    const seasons = this.uniqueSeasons(this.state.products);

    if (error) return <div className="container"><div className="error">{error}</div></div>;

    return (
      <div className="pf-root">
        <div className="pf-toolbar">
          <input placeholder="Search" value={search} onChange={e => this.setState({ search: e.target.value })} />
          <select value={category} onChange={e => this.setState({ category: e.target.value })}>
            <option value="">All Categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={season} onChange={e => this.setState({ season: e.target.value })}>
            <option value="">All Seasons</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="number" placeholder="Min €" value={priceMin} onChange={e => this.setState({ priceMin: e.target.value })} />
          <input type="number" placeholder="Max €" value={priceMax} onChange={e => this.setState({ priceMax: e.target.value })} />
          <input type="number" placeholder="Min g" value={weightMin} onChange={e => this.setState({ weightMin: e.target.value })} />
          <input type="number" placeholder="Max g" value={weightMax} onChange={e => this.setState({ weightMax: e.target.value })} />
          <select value={this.state.sortMode} onChange={e => this.setState({ sortMode: e.target.value as SortMode })}>
            <option value="none">Sort: None</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="price-asc">Price (Low-High)</option>
            <option value="price-desc">Price (High-Low)</option>
            <option value="weight-asc">Weight (Light-Heavy)</option>
            <option value="weight-desc">Weight (Heavy-Light)</option>
            <option value="season-desc">Season (Newest)</option>
          </select>
          <button onClick={() => this.setState({ search: '', category: '', season: '', priceMin: '', priceMax: '', weightMin: '', weightMax: '' })}>Reset Filters</button>
          <button onClick={() => this.viewport?.reset()}>Reset View</button>
          <button 
            onClick={() => this.setState({ showOnlyFavorites: !this.state.showOnlyFavorites })}
            style={{ fontWeight: this.state.showOnlyFavorites ? 'bold' : 'normal' }}
          >
            ❤️ Favorites {this.state.showOnlyFavorites ? 'ON' : 'OFF'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => this.setState({ layoutMode: 'grid' })}
              style={{ fontWeight: this.state.layoutMode === 'grid' ? 'bold' : 'normal' }}
            >
              Grid
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'list' })}
              style={{ fontWeight: this.state.layoutMode === 'list' ? 'bold' : 'normal' }}
            >
              List
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'compact' })}
              style={{ fontWeight: this.state.layoutMode === 'compact' ? 'bold' : 'normal' }}
            >
              Compact
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'large' })}
              style={{ fontWeight: this.state.layoutMode === 'large' ? 'bold' : 'normal' }}
            >
              Large
            </button>
          </div>
        </div>
        <div className="pf-stage">
          <canvas ref={this.canvasRef} className="pf-canvas" />
        </div>
        
        <ProductModal 
          product={selectedProduct} 
          onClose={() => this.setState({ selectedProduct: null })} 
        />
        
        {hoveredProduct && mousePos && (
          <div 
            className="pf-tooltip"
            style={{
              position: 'fixed',
              left: mousePos.x + 15,
              top: mousePos.y + 15,
              pointerEvents: 'none',
            }}
          >
            <div className="pf-tooltip-content">
              <div className="pf-tooltip-name">{hoveredProduct.name}</div>
              {hoveredProduct.price && (
                <div className="pf-tooltip-price">{hoveredProduct.price.formatted}</div>
              )}
              {hoveredProduct.brand && (
                <div className="pf-tooltip-brand">{hoveredProduct.brand}</div>
              )}
              <div className="pf-tooltip-hint">Click for details</div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
