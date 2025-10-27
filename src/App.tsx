import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import { ProductModal } from './components/ProductModal';
import type { SortMode } from './services/FilterService';
import type { LayoutMode } from './services/LayoutService';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type State = {
  loading: boolean;
  error: string | null;
  filteredProducts: Product[];
  
  // UI State
  search: string;
  category: string;
  season: string;
  priceMin: string;
  priceMax: string;
  weightMin: string;
  weightMax: string;
  sortMode: SortMode;
  layoutMode: LayoutMode;
  showOnlyFavorites: boolean;
  
  // Interaction State
  selectedProduct: Product | null;
  hoveredProduct: Product | null;
  mousePos: { x: number; y: number } | null;
  focusedIndex: number;
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private controller = new ProductFinderController();

  state: State = {
    loading: true,
    error: null,
    filteredProducts: [],
    
    search: '',
    category: '',
    season: '',
    priceMin: '',
    priceMax: '',
    weightMin: '',
    weightMax: '',
    sortMode: 'none',
    layoutMode: 'grid',
    showOnlyFavorites: false,
    
    selectedProduct: null,
    hoveredProduct: null,
    mousePos: null,
    focusedIndex: -1,
  };

  async componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Initialize controller
    await this.controller.initialize(canvas);
    
    // Listen to controller state changes
    this.controller.addListener(state => {
      this.setState({
        loading: state.loading,
        error: state.error,
        filteredProducts: state.filteredProducts,
      });
    });

    // Setup event listeners
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('click', this.handleCanvasClick);
    canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', this.handleCanvasMouseLeave);
    document.addEventListener('keydown', this.handleKeyDown);

    // Initial resize
    requestAnimationFrame(() => this.handleResize());
  }

  componentWillUnmount(): void {
    this.controller.destroy();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('click', this.handleCanvasClick);
      canvas.removeEventListener('mousemove', this.handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', this.handleCanvasMouseLeave);
    }
  }

  componentDidUpdate(prevProps: {}, prevState: State): void {
    // Update filter criteria
    if (
      prevState.search !== this.state.search ||
      prevState.category !== this.state.category ||
      prevState.season !== this.state.season ||
      prevState.priceMin !== this.state.priceMin ||
      prevState.priceMax !== this.state.priceMax ||
      prevState.weightMin !== this.state.weightMin ||
      prevState.weightMax !== this.state.weightMax
    ) {
      this.controller.setFilterCriteria({
        search: this.state.search,
        category: this.state.category,
        season: this.state.season,
        priceMin: this.state.priceMin,
        priceMax: this.state.priceMax,
        weightMin: this.state.weightMin,
        weightMax: this.state.weightMax,
      });
    }

    // Update sort mode
    if (prevState.sortMode !== this.state.sortMode) {
      this.controller.setSortMode(this.state.sortMode);
    }

    // Update layout mode
    if (prevState.layoutMode !== this.state.layoutMode) {
      this.controller.setLayoutMode(this.state.layoutMode);
    }

    // Update favorites filter
    if (prevState.showOnlyFavorites !== this.state.showOnlyFavorites) {
      this.controller.setShowOnlyFavorites(this.state.showOnlyFavorites);
    }

    // Update hover state
    if (prevState.hoveredProduct !== this.state.hoveredProduct) {
      this.controller.setHoveredProduct(this.state.hoveredProduct);
    }

    // Update focus state
    if (prevState.focusedIndex !== this.state.focusedIndex) {
      const { filteredProducts, focusedIndex } = this.state;
      const focusedProduct = focusedIndex >= 0 && focusedIndex < filteredProducts.length
        ? filteredProducts[focusedIndex]
        : null;
      this.controller.setFocusedProduct(focusedProduct);
    }
  }

  private handleResize = () => {
    this.controller.handleResize();
  };

  private handleCanvasClick = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const product = this.controller.hitTest(x, y);
    if (product) {
      this.setState({ selectedProduct: product });
    }
  };

  private handleCanvasMouseMove = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const product = this.controller.hitTest(x, y);
    
    if (product !== this.state.hoveredProduct) {
      this.setState({
        hoveredProduct: product,
        mousePos: product ? { x: e.clientX, y: e.clientY } : null
      });
      canvas.style.cursor = product ? 'pointer' : 'default';
    } else if (product) {
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

    const { filteredProducts, focusedIndex } = this.state;
    if (filteredProducts.length === 0) return;

    let newIndex = focusedIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, filteredProducts.length - 1);
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
        newIndex = filteredProducts.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredProducts.length) {
          this.setState({ selectedProduct: filteredProducts[focusedIndex] });
        }
        return;
      default:
        return;
    }

    if (newIndex !== focusedIndex) {
      this.setState({ focusedIndex: newIndex });
    }
  };

  render() {
    const { loading, error, selectedProduct, hoveredProduct, mousePos } = this.state;
    const { search, category, season, priceMin, priceMax, weightMin, weightMax, sortMode, layoutMode, showOnlyFavorites } = this.state;

    const cats = this.controller.getUniqueCategories();
    const seasons = this.controller.getUniqueSeasons();

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
          <select value={sortMode} onChange={e => this.setState({ sortMode: e.target.value as SortMode })}>
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
          <button onClick={() => this.controller.resetViewport()}>Reset View</button>
          <button 
            onClick={() => this.setState({ showOnlyFavorites: !showOnlyFavorites })}
            style={{ fontWeight: showOnlyFavorites ? 'bold' : 'normal' }}
          >
            ❤️ Favorites {showOnlyFavorites ? 'ON' : 'OFF'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => this.setState({ layoutMode: 'grid' })}
              style={{ fontWeight: layoutMode === 'grid' ? 'bold' : 'normal' }}
            >
              Grid
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'list' })}
              style={{ fontWeight: layoutMode === 'list' ? 'bold' : 'normal' }}
            >
              List
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'compact' })}
              style={{ fontWeight: layoutMode === 'compact' ? 'bold' : 'normal' }}
            >
              Compact
            </button>
            <button 
              onClick={() => this.setState({ layoutMode: 'large' })}
              style={{ fontWeight: layoutMode === 'large' ? 'bold' : 'normal' }}
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

