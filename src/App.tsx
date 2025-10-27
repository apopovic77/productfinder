import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductLayoutAccessors, ProductRenderAccessors } from './layout/Accessors';
import { WeightScalePolicy } from './layout/ScalePolicy';
import { GridLayoutStrategy } from './layout/GridLayoutStrategy';
import { PivotLayouter, type PivotConfig } from './layout/PivotLayouter';
import { LayoutEngine } from './layout/LayoutEngine';
import { CanvasRenderer } from './render/CanvasRenderer';
import { fetchProducts } from './data/ProductRepository';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private renderer: CanvasRenderer<Product> | null = null;
  private engine: LayoutEngine<Product> | null = null;
  private layouter: PivotLayouter<Product> | null = null;
  private access = new ProductLayoutAccessors();
  private renderAccess = new ProductRenderAccessors();
  private scalePolicy = new WeightScalePolicy();

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
  };

  async componentDidMount() {
    // Initialize canvas first
    const canvas = this.canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const config: PivotConfig<Product> = {
          orientation: 'columns', flow: 'ltr',
          groupKey: p => this.access.groupKey(p),
          frameGap: 24, framePadding: 12, itemGap: 12, rowBaseHeight: 120,
          access: this.access, scale: this.scalePolicy, innerFactory: () => new GridLayoutStrategy<Product>()
        };
        this.layouter = new PivotLayouter<Product>(config);
        this.engine = new LayoutEngine<Product>(this.layouter);
        this.renderer = new CanvasRenderer<Product>(ctx, () => this.engine!.all(), this.renderAccess);
        this.renderer.start();
        window.addEventListener('resize', this.handleResize);
        
        // Set initial canvas size
        requestAnimationFrame(() => {
          this.handleResize();
        });
      }
    }

    // Load products
    try {
      const results = await fetchProducts({ limit: 1000 });
      this.setState({ products: results || [], loading: false }, () => {
        // Trigger layout after products are loaded
        if (this.engine && canvas) {
          this.engine.sync(this.filteredProducts, p => p.id);
          this.engine.layout({ width: canvas.clientWidth, height: canvas.clientHeight });
        }
      });
    } catch (e: any) {
      this.setState({ error: e.message || 'Load error', loading: false });
    }
  }

  componentWillUnmount(): void {
    if (this.renderer) this.renderer.stop();
    window.removeEventListener('resize', this.handleResize);
  }

  componentDidUpdate(prevProps: {}, prevState: State): void {
    if (!this.engine) return;
    if (
      prevState.products !== this.state.products ||
      prevState.search !== this.state.search ||
      prevState.category !== this.state.category ||
      prevState.season !== this.state.season ||
      prevState.priceMin !== this.state.priceMin ||
      prevState.priceMax !== this.state.priceMax ||
      prevState.weightMin !== this.state.weightMin ||
      prevState.weightMax !== this.state.weightMax
    ) {
      this.engine.sync(this.filteredProducts, p => p.id);
      const c = this.canvasRef.current;
      if (c) this.engine.layout({ width: c.clientWidth, height: c.clientHeight });
    }
  }

  private handleResize = () => {
    const c = this.canvasRef.current;
    if (!c || !c.parentElement) return;
    
    // Get dimensions from parent element since canvas is a replaced element
    const parent = c.parentElement;
    const width = parent.clientWidth || window.innerWidth;
    const height = parent.clientHeight || window.innerHeight;
    
    console.log('Canvas resize:', { 
      width, 
      height, 
      parentWidth: parent.clientWidth,
      parentHeight: parent.clientHeight,
      canvasOffset: c.offsetWidth 
    });
    
    c.width = width;
    c.height = height;
    if (this.engine) this.engine.layout({ width, height });
  };

  private get filteredProducts(): Product[] {
    const { products, search, category, season, priceMin, priceMax, weightMin, weightMax } = this.state;
    return products.filter(p => {
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
    const { loading, error, search, category, season, priceMin, priceMax, weightMin, weightMax } = this.state;
    const cats = this.uniqueCategories(this.state.products);
    const seasons = this.uniqueSeasons(this.state.products);

    if (error) return <div className="container"><div className="error">{error}</div></div>;

    return (
      <div className="pf-root">
        {loading && (
          <div style={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            background: 'rgba(255,255,255,0.9)',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div className="loading">Loading products...</div>
          </div>
        )}
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
          <button onClick={() => this.setState({ search: '', category: '', season: '', priceMin: '', priceMax: '', weightMin: '', weightMax: '' })}>Reset</button>
        </div>
        <div className="pf-stage">
          <canvas ref={this.canvasRef} className="pf-canvas" />
        </div>
      </div>
    );
  }
}
