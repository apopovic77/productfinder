/**
 * HTML Overlay Layer for ProductFinder v2
 *
 * Renders on top of the Three.js canvas:
 * - HUD (product count, version info)
 * - Breadcrumbs
 * - Dimension Picker
 * - Hover Tooltip
 * - Product Detail Dialog (V4)
 */
import type { Product } from '../../types/Product';
import type { PivotDimensionDefinition } from '../../services/PivotDimensionAnalyzer';

interface OverlayLayerProps {
  loading: boolean;
  error: string | null;
  productCount: number;
  breadcrumbs: string[];
  activeDimension: string | null;
  availableDimensions: PivotDimensionDefinition[];
  heroMode: boolean;
  hoveredProductId: string | null;
  selectedProduct: Product | null;
  mode: 'taxonomy' | 'gpane';
  onBreadcrumbClick: (index: number) => void;
  onDimensionSelect: (key: string) => void;
  onDrillUp: () => void;
  onProductClose: () => void;
}

export function OverlayLayer({
  loading, error, productCount, breadcrumbs,
  activeDimension, availableDimensions, heroMode,
  hoveredProductId, selectedProduct, mode,
  onBreadcrumbClick, onDimensionSelect, onDrillUp, onProductClose,
}: OverlayLayerProps) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none',
      fontFamily: "'ITC Avant Garde Gothic', system-ui, sans-serif",
    }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', pointerEvents: 'auto',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
      }}>
        {/* Left: Title + Status */}
        <div style={{ color: '#fff', fontSize: 13 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            ProductFinder <span style={{ color: '#58a6ff' }}>v2</span>
            <span style={{ color: '#8b949e', fontSize: 10, marginLeft: 8 }}>Arcturian Engine</span>
          </div>
          <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
            {loading ? 'Loading...' : error ? `Error: ${error}` : `${productCount} products · GPU instanced`}
          </div>
        </div>

        {/* Right: Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {breadcrumbs.map((crumb, i) => (
            <span key={`crumb-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: '#555', fontSize: 12 }}>›</span>}
              <button
                onClick={() => onBreadcrumbClick(i)}
                disabled={i === breadcrumbs.length - 1}
                style={{
                  background: i === breadcrumbs.length - 1 ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.05)',
                  border: 'none',
                  color: i === breadcrumbs.length - 1 ? '#58a6ff' : '#ccc',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: i === breadcrumbs.length - 1 ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                }}
              >
                {crumb}
              </button>
            </span>
          ))}
          {breadcrumbs.length > 1 && (
            <button
              onClick={onDrillUp}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none', color: '#aaa', padding: '4px 8px',
                borderRadius: 4, fontSize: 11, cursor: 'pointer',
                fontFamily: 'inherit', marginLeft: 8,
              }}
            >
              ← Zurück
            </button>
          )}
        </div>
      </div>

      {/* Dimension Picker (bottom left) */}
      {availableDimensions.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16,
          display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 400,
          pointerEvents: 'auto',
        }}>
          {availableDimensions.slice(0, 8).map(dim => (
            <button
              key={dim.key}
              onClick={() => onDimensionSelect(dim.key)}
              style={{
                background: dim.key === activeDimension ? 'rgba(88,166,255,0.25)' : 'rgba(255,255,255,0.06)',
                border: dim.key === activeDimension ? '1px solid rgba(88,166,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: dim.key === activeDimension ? '#58a6ff' : '#999',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {dim.label}
            </button>
          ))}
        </div>
      )}

      {/* Hover Info (bottom right) */}
      {hoveredProductId && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16,
          background: 'rgba(0,0,0,0.8)', padding: '8px 12px',
          borderRadius: 6, color: '#fff', fontSize: 12,
          backdropFilter: 'blur(8px)',
        }}>
          ID: {hoveredProductId}
        </div>
      )}

      {/* Hero Mode Indicator */}
      {heroMode && (
        <div style={{
          position: 'absolute', top: 70, left: 16,
          background: 'rgba(63,185,80,0.15)', border: '1px solid rgba(63,185,80,0.3)',
          padding: '4px 10px', borderRadius: 4,
          color: '#3fb950', fontSize: 11,
        }}>
          Hero Mode
        </div>
      )}

      {/* Mode Badge */}
      <div style={{
        position: 'absolute', top: 70, right: 16,
        background: mode === 'taxonomy' ? 'rgba(136,96,208,0.15)' : 'rgba(88,166,255,0.15)',
        border: `1px solid ${mode === 'taxonomy' ? 'rgba(136,96,208,0.3)' : 'rgba(88,166,255,0.3)'}`,
        padding: '4px 10px', borderRadius: 4,
        color: mode === 'taxonomy' ? '#8860d0' : '#58a6ff',
        fontSize: 11,
      }}>
        {mode === 'taxonomy' ? 'Taxonomy' : 'GPANE'}
      </div>
    </div>
  );
}
