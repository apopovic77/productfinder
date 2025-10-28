import React from 'react';
import './App.css';
import type { Product } from './types/Product';
import { ProductFinderController } from './controller/ProductFinderController';
import ProductModal from './components/ProductModal';
import { AnimatePresence } from 'framer-motion';
import { DeveloperOverlay, type DeveloperSettings } from './components/DeveloperOverlay';
import type { SortMode } from './services/FilterService';
import type { LayoutMode } from './services/LayoutService';
import type { GroupDimension } from './services/PivotDrillDownService';

const PIVOT_DIMENSION_LABELS: Record<GroupDimension, string> = {
  'category': 'Category',
  'subcategory': 'Subcategory',
  'brand': 'Brand',
  'season': 'Season',
  'price-range': 'Price'
};

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
  
  // Pivot State
  pivotDimension: GroupDimension;
  pivotBreadcrumbs: string[];
  pivotDimensions: GroupDimension[];
  
  // Interaction State
  selectedProduct: Product | null;
  hoveredProduct: Product | null;
  mousePos: { x: number; y: number } | null;
  focusedIndex: number;
  
  // Developer Settings
  devSettings: DeveloperSettings;
  fps: number;
  zoom: number;
};

export default class App extends React.Component<{}, State> {
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private controller = new ProductFinderController();
  private fpsRaf: number | null = null;
  private fpsLastSample = 0;
  private fpsFrameCount = 0;

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
    layoutMode: 'pivot',
    showOnlyFavorites: false,
    
    pivotDimension: 'category',
    pivotBreadcrumbs: ['All'],
    pivotDimensions: ['category', 'subcategory', 'brand', 'season', 'price-range'],
    
    selectedProduct: null,
    hoveredProduct: null,
    mousePos: null,
    focusedIndex: -1,
    
    devSettings: {
      gridConfig: {
        spacing: 1,
        margin: 40,
        minCellSize: 120,
        maxCellSize: 250
      },
      showDebugInfo: false,
      showBoundingBoxes: false,
      animationDuration: 1,
      priceBucketMode: 'static',
      priceBucketCount: 5
    },
    fps: 60,
    zoom: 1,
  };

  async componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    // Initialize controller
    await this.controller.initialize(canvas);
    this.controller.setAnimationDuration(this.state.devSettings.animationDuration);
    this.controller.setPriceBucketConfig(
      this.state.devSettings.priceBucketMode,
      this.state.devSettings.priceBucketCount
    );
    this.syncPivotUI();
    
    // Listen to controller state changes
    this.controller.addListener(state => {
      this.setState({
        loading: state.loading,
        error: state.error,
        filteredProducts: state.filteredProducts,
      }, this.syncPivotUI);
    });

    // Setup event listeners
    window.addEventListener('resize', this.handleResize);
    canvas.addEventListener('click', this.handleCanvasClick);
    canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', this.handleCanvasMouseLeave);
    document.addEventListener('keydown', this.handleKeyDown);

    // Start FPS counter
    this.startFPSCounter();

    // Initial resize
    requestAnimationFrame(() => this.handleResize());
  }

  componentWillUnmount(): void {
    this.controller.destroy();
    this.stopFPSCounter();
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
  
  private syncPivotUI = () => {
    this.setState({
      pivotBreadcrumbs: this.controller.getPivotBreadcrumbs(),
      pivotDimension: this.controller.getPivotDimension(),
      pivotDimensions: this.controller.getPivotDimensions(),
    });
  };

  private startFPSCounter = () => {
    this.fpsLastSample = performance.now();
    this.fpsFrameCount = 0;
    const tick = (now: number) => {
      this.fpsFrameCount += 1;
      if (now - this.fpsLastSample >= 500) {
        const elapsed = now - this.fpsLastSample;
        const fps = (this.fpsFrameCount * 1000) / elapsed;
        const zoom = this.controller.getZoom();
        this.setState({ fps, zoom });
        this.fpsFrameCount = 0;
        this.fpsLastSample = now;
      }
      this.fpsRaf = requestAnimationFrame(tick);
    };
    this.fpsRaf = requestAnimationFrame(tick);
  };

  private stopFPSCounter = () => {
    if (this.fpsRaf !== null) {
      cancelAnimationFrame(this.fpsRaf);
      this.fpsRaf = null;
    }
  };

  private handleDevSettingsChange = (newSettings: DeveloperSettings) => {
    this.setState({ devSettings: newSettings });
    // Apply settings to controller/layout
    this.controller.updateGridConfig(newSettings.gridConfig);
    this.controller.setAnimationDuration(newSettings.animationDuration);
    this.controller.setPriceBucketConfig(newSettings.priceBucketMode, newSettings.priceBucketCount);
  };

  private handleBreadcrumbClick = (index: number) => {
    const { pivotBreadcrumbs } = this.state;
    if (index < 0 || index >= pivotBreadcrumbs.length) return;
    if (index === pivotBreadcrumbs.length - 1) return; // current level
    if (index === 0) {
      this.controller.resetPivot();
      this.controller.setPivotDimension('category');
    } else {
      const levelsToRemove = pivotBreadcrumbs.length - 1 - index;
      for (let i = 0; i < levelsToRemove; i++) {
        this.controller.drillUpPivot();
      }
    }
    this.syncPivotUI();
  };

  private handleDimensionClick = (dimension: GroupDimension) => {
    if (dimension === this.state.pivotDimension) return;
    if (!this.controller.canUsePivotDimension(dimension)) return;
    this.controller.setPivotDimension(dimension);
    this.syncPivotUI();
  };

  private handleCanvasClick = (e: MouseEvent) => {
    const canvas = this.canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for group header click first (in pivot mode)
    const groupHeaderClicked = this.controller.handleGroupHeaderClick(x, y);
    if (groupHeaderClicked) {
      this.syncPivotUI();
      return;
    }

    // Otherwise check for product click
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
    const { search, category, season, priceMin, priceMax, weightMin, weightMax, sortMode, layoutMode, showOnlyFavorites, pivotDimension, pivotBreadcrumbs, pivotDimensions } = this.state;

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
          <button 
            onClick={() => this.controller.setLayoutMode('pivot')}
            style={{ fontWeight: layoutMode === 'pivot' ? 'bold' : 'normal' }}
          >
            📚 Pivot
          </button>
          
          {layoutMode === 'pivot' && (
            <>
              <select 
                value={pivotDimension}
                onChange={(e) => {
                  const dim = e.target.value as GroupDimension;
                  this.controller.setPivotDimension(dim);
                  this.syncPivotUI();
                }}
              >
                <option value="category">By Category</option>
                <option value="subcategory" disabled={!this.controller.canUsePivotDimension('subcategory')}>
                  By Subcategory
                </option>
                <option value="brand">By Brand</option>
                <option value="season">By Season</option>
                <option value="price-range">By Price</option>
              </select>
              <button
                onClick={() => {
                  this.controller.drillUpPivot();
                  this.syncPivotUI();
                }}
                disabled={!this.controller.canDrillUpPivot()}
              >
                ← Back
              </button>
              
              {pivotBreadcrumbs.length > 1 && (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {pivotBreadcrumbs.map((crumb, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span style={{ color: '#9ca3af' }}>›</span>}
                      <button
                        onClick={() => this.handleBreadcrumbClick(i)}
                        disabled={i === pivotBreadcrumbs.length - 1}
                        style={{ 
                          fontWeight: i === pivotBreadcrumbs.length - 1 ? 'bold' : 'normal',
                          padding: '4px 8px'
                        }}
                      >
                        {crumb}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </>
          )}
          <button 
            onClick={() => this.controller.setLayoutMode('grid')}
            style={{ fontWeight: layoutMode === 'grid' ? 'bold' : 'normal' }}
          >
            📊 Grid
          </button>
          <button 
            onClick={() => this.controller.setLayoutMode('masonry')}
            style={{ fontWeight: layoutMode === 'masonry' ? 'bold' : 'normal' }}
          >
            🧱 Masonry
          </button>
          <button 
            onClick={() => this.controller.setLayoutMode('compact')}
            style={{ fontWeight: layoutMode === 'compact' ? 'bold' : 'normal' }}
          >
            🔬 Compact
          </button>
          <button 
            onClick={() => this.controller.setLayoutMode('large')}
            style={{ fontWeight: layoutMode === 'large' ? 'bold' : 'normal' }}
          >
            🔭 Large
        </button>
        </div>
        <div className="pf-stage">
          <canvas ref={this.canvasRef} className="pf-canvas" />
        </div>

        {layoutMode === 'pivot' && (
          <div className="pf-pivot-footer">
            <div className="pf-pivot-footrow" aria-label="Pivot navigation">
              {pivotBreadcrumbs.map((crumb, i) => (
                <React.Fragment key={`${crumb}-${i}`}>
                  {i > 0 && <span className="pf-pivot-sep">›</span>}
                  <button
                    className={`pf-pivot-chip ${i === pivotBreadcrumbs.length - 1 ? 'active' : ''}`}
                    onClick={() => this.handleBreadcrumbClick(i)}
                    disabled={i === pivotBreadcrumbs.length - 1}
                  >
                    {crumb}
                  </button>
                </React.Fragment>
              ))}
              {pivotDimensions.length > 0 && <span className="pf-pivot-divider" />}
              {pivotDimensions.map(dim => {
                const enabled = this.controller.canUsePivotDimension(dim) || dim === pivotDimension;
                return (
                  <button
                    key={dim}
                    className={`pf-pivot-chip ${dim === pivotDimension ? 'active' : ''}`}
                    onClick={() => enabled && this.handleDimensionClick(dim)}
                    disabled={!enabled || dim === pivotDimension}
                  >
                    {PIVOT_DIMENSION_LABELS[dim] ?? dim}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {selectedProduct && (
            <ProductModal
              key={selectedProduct.id}
              product={selectedProduct}
              onClose={() => this.setState({ selectedProduct: null })}
            />
          )}
        </AnimatePresence>
        
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

        <DeveloperOverlay
          settings={this.state.devSettings}
          onSettingsChange={this.handleDevSettingsChange}
          productCount={this.state.filteredProducts.length}
          fps={this.state.fps}
          zoom={this.state.zoom}
        />
      </div>
    );
  }
}
