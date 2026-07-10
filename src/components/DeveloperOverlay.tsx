import React from 'react';
import './DeveloperOverlay.css';
import type { PriceBucketMode } from '../types/pivot';

export type GridConfig = {
  spacing: number;
  margin: number;
  minCellSize: number;
  maxCellSize: number;
};

export type ForceLabelsConfig = {
  anchorStrength: number;
  repulsionStrength: number;
  repulsionRadius: number;
  minDistance: number;
  maxDistance: number;
  friction: number;
};

export type HeroDisplayMode = 'overlay' | 'force-labels';
export type OverlayScaleMode = 'scale-invariant' | 'scale-with-content';
export type ImageSpreadDirection = 'auto' | 'horizontal' | 'vertical';

export type DeveloperSettings = {
  gridConfig: GridConfig;
  forceLabelsConfig: ForceLabelsConfig;
  showDebugInfo: boolean;
  showBoundingBoxes: boolean;
  animationDuration: number;
  priceBucketMode: PriceBucketMode;
  priceBucketCount: number;
  heroDisplayMode: HeroDisplayMode;
  overlayScaleMode: OverlayScaleMode;
  imageSpreadDirection: ImageSpreadDirection;
  cellSizeOverride: number;  // 0 = auto
  rectMode: boolean;
  showBoundsDebug: boolean;
  ignoreBounds: boolean;
  minCellSize: number;  // 0 = no minimum
};

type DeveloperOverlayProps = {
  settings: DeveloperSettings;
  onSettingsChange: (settings: DeveloperSettings) => void;
  productCount: number;
  fps?: number;
  zoom?: number;
  drawTimeMs?: number;
  visibleCount?: number;
  culledCount?: number;
  productLimit?: number;
  onProductLimitChange?: (limit: number) => void;
};

export const DeveloperOverlay: React.FC<DeveloperOverlayProps> = ({
  settings,
  onSettingsChange,
  productCount,
  fps = 0,
  zoom = 1,
  drawTimeMs = 0,
  visibleCount = 0,
  culledCount = 0,
  productLimit = 5000,
  onProductLimitChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const dragRef = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleDragStart = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.dev-overlay') as HTMLElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    const onToggle = () => setIsOpen(prev => !prev);
    const onOpen = () => setIsOpen(true);
    const onClose = () => setIsOpen(false);
    window.addEventListener('pf-toggle-dev-overlay' as any, onToggle as EventListener);
    window.addEventListener('pf-open-dev-overlay' as any, onOpen as EventListener);
    window.addEventListener('pf-close-dev-overlay' as any, onClose as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pf-toggle-dev-overlay' as any, onToggle as EventListener);
      window.removeEventListener('pf-open-dev-overlay' as any, onOpen as EventListener);
      window.removeEventListener('pf-close-dev-overlay' as any, onClose as EventListener);
    };
  }, []);

  const updateGridConfig = (key: keyof GridConfig, value: number) => {
    onSettingsChange({
      ...settings,
      gridConfig: {
        ...settings.gridConfig,
        [key]: value
      }
    });
  };

  const updateForceLabelsConfig = (key: keyof ForceLabelsConfig, value: number) => {
    onSettingsChange({
      ...settings,
      forceLabelsConfig: {
        ...settings.forceLabelsConfig,
        [key]: value
      }
    });
  };

  const updateSetting = (key: keyof DeveloperSettings, value: any) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  const resetToDefaults = () => {
    onSettingsChange({
      gridConfig: {
        spacing: 1,
        margin: 50,
        minCellSize: 120,
        maxCellSize: 250
      },
      forceLabelsConfig: {
        anchorStrength: 0.2,
        repulsionStrength: 200,
        repulsionRadius: 200,
        minDistance: 80,
        maxDistance: 250,
        friction: 0.85,
      },
      showDebugInfo: false,
      showBoundingBoxes: false,
      animationDuration: 1.0,
      priceBucketMode: 'static',
      priceBucketCount: 5,
      heroDisplayMode: 'overlay',
      overlayScaleMode: 'scale-with-content',
      imageSpreadDirection: 'auto',
      cellSizeOverride: 0,
      rectMode: false,
      showBoundsDebug: false,
      ignoreBounds: false,
      minCellSize: 20,
    });
  };

  const exportSettings = () => {
    const json = JSON.stringify(settings, null, 2);
    navigator.clipboard.writeText(json);
    alert('Settings copied to clipboard!');
  };

  if (!isOpen) return null;

  return (
    <div className={`dev-overlay ${isMinimized ? 'minimized' : ''}`}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      <div className="dev-overlay-header" onMouseDown={handleDragStart} style={{ cursor: 'grab' }}>
        <h3>🛠️ Developer</h3>
        <div className="dev-overlay-actions">
          <button onClick={() => setIsMinimized(!isMinimized)} title="Minimize">
            {isMinimized ? '▼' : '▲'}
          </button>
          <button onClick={() => setIsOpen(false)} title="Close">
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="dev-overlay-content">
          {/* Stats */}
          <div className="dev-section">
            <h4>📊 Stats</h4>
            <div className="dev-stats">
              <div className="dev-stat">
                <span className="dev-stat-label">Products:</span>
                <span className="dev-stat-value">{productCount}</span>
              </div>
              <div className="dev-stat">
                <span className="dev-stat-label">FPS:</span>
                <span className="dev-stat-value">{fps.toFixed(1)}</span>
              </div>
              <div className="dev-stat">
                <span className="dev-stat-label">Zoom:</span>
                <span className="dev-stat-value" style={{
                  color: zoom > 5 ? '#10b981' : zoom > 2 ? '#f59e0b' : '#6b7280'
                }}>
                  {zoom.toFixed(2)}x
                </span>
              </div>
              <div className="dev-stat">
                <span className="dev-stat-label">Draw:</span>
                <span className="dev-stat-value" style={{
                  color: drawTimeMs < 8 ? '#10b981' : drawTimeMs < 16 ? '#f59e0b' : '#ef4444'
                }}>
                  {drawTimeMs.toFixed(1)}ms
                </span>
              </div>
              <div className="dev-stat">
                <span className="dev-stat-label">Visible:</span>
                <span className="dev-stat-value">{visibleCount}</span>
              </div>
              <div className="dev-stat">
                <span className="dev-stat-label">Culled:</span>
                <span className="dev-stat-value">{culledCount}</span>
              </div>
            </div>

            {/* Product Limit Slider */}
            {onProductLimitChange && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                  <span>Product Limit</span>
                  <input
                    type="number"
                    min="10"
                    max="5000"
                    step="10"
                    value={productLimit}
                    onChange={e => onProductLimitChange(Math.max(10, Math.min(5000, Number(e.target.value) || 50)))}
                    style={{ width: '60px', background: '#1a202c', border: '1px solid #4a5568', borderRadius: '4px', color: '#e5e7eb', fontFamily: 'inherit', fontSize: '11px', padding: '2px 4px', textAlign: 'right' }}
                  />
                </div>
                <input
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={productLimit}
                  onChange={e => onProductLimitChange(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            {/* Rect Mode */}
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={settings.rectMode}
                onChange={e => onSettingsChange({ ...settings, rectMode: e.target.checked })}
                id="rect-mode"
              />
              <label htmlFor="rect-mode" style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer' }}>
                Rect Mode (no images — perf test)
              </label>
            </div>

            {/* Bounds Debug */}
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={settings.showBoundsDebug} id="bounds-debug"
                onChange={e => onSettingsChange({ ...settings, showBoundsDebug: e.target.checked })} />
              <label htmlFor="bounds-debug" style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer' }}>
                Show Bounds (blue=auto, red=content)
              </label>
            </div>
            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={settings.ignoreBounds} id="ignore-bounds"
                onChange={e => onSettingsChange({ ...settings, ignoreBounds: e.target.checked })} />
              <label htmlFor="ignore-bounds" style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer' }}>
                Ignore Bounds (free pan)
              </label>
            </div>

            {/* Min Cell Size */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                <span>Min Cell Size</span>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                  {settings.minCellSize === 0 ? 'Off' : `${settings.minCellSize}px`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.minCellSize}
                onChange={e => onSettingsChange({ ...settings, minCellSize: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#6b7280' }}>
                <span>Off</span>
                <span>25</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            {/* Cell Size Override */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>
                <span>Cell Size Override</span>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>
                  {settings.cellSizeOverride === 0 ? 'Auto' : `${settings.cellSizeOverride}px`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={settings.cellSizeOverride}
                onChange={e => onSettingsChange({ ...settings, cellSizeOverride: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#6b7280' }}>
                <span>Auto</span>
                <span>50</span>
                <span>100</span>
                <span>200</span>
              </div>
            </div>
          </div>

          {/* Grid Configuration */}
          <div className="dev-section">
            <h4>📐 Grid Configuration</h4>
            
            <div className="dev-control">
              <label>
                Spacing: <strong>{settings.gridConfig.spacing}px</strong>
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.gridConfig.spacing}
                onChange={(e) => updateGridConfig('spacing', Number(e.target.value))}
              />
            </div>

            <div className="dev-control">
              <label>
                Margin: <strong>{settings.gridConfig.margin}px</strong>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.gridConfig.margin}
                onChange={(e) => updateGridConfig('margin', Number(e.target.value))}
              />
            </div>

            <div className="dev-control">
              <label>
                Min Cell Size: <strong>{settings.gridConfig.minCellSize}px</strong>
              </label>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={settings.gridConfig.minCellSize}
                onChange={(e) => updateGridConfig('minCellSize', Number(e.target.value))}
              />
            </div>

            <div className="dev-control">
              <label>
                Max Cell Size: <strong>{settings.gridConfig.maxCellSize}px</strong>
              </label>
              <input
                type="range"
                min="100"
                max="500"
                step="10"
                value={settings.gridConfig.maxCellSize}
                onChange={(e) => updateGridConfig('maxCellSize', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Animation */}
          <div className="dev-section">
            <h4>🎬 Animation</h4>
            
            <div className="dev-control">
              <label>
                Animation Duration: <strong>{settings.animationDuration.toFixed(2)}s</strong>
              </label>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={settings.animationDuration}
                onChange={(e) => updateSetting('animationDuration', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Price Buckets */}
          <div className="dev-section">
            <h4>💰 Price Buckets</h4>

            <div className="dev-control">
              <label>
                Mode: <strong>{settings.priceBucketMode}</strong>
              </label>
              <select
                value={settings.priceBucketMode}
                onChange={(e) => updateSetting('priceBucketMode', e.target.value as PriceBucketMode)}
              >
                <option value="static">Static ranges</option>
                <option value="equal-width">Equal width</option>
                <option value="quantile">Quantile (equal count)</option>
                <option value="kmeans">K-means clustering</option>
              </select>
            </div>

            <div className="dev-control">
              <label>
                Buckets: <strong>{settings.priceBucketCount}</strong>
              </label>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.priceBucketCount}
                onChange={(e) => updateSetting('priceBucketCount', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Hero Mode Display */}
          <div className="dev-section">
            <h4>🎯 Hero Mode Display</h4>

            <div className="dev-control">
              <label>
                Display Mode: <strong>{settings.heroDisplayMode === 'overlay' ? 'Overlay Card' : 'Force Labels'}</strong>
              </label>
              <select
                value={settings.heroDisplayMode}
                onChange={(e) => updateSetting('heroDisplayMode', e.target.value as HeroDisplayMode)}
              >
                <option value="overlay">Overlay Card</option>
                <option value="force-labels">Force Labels (Anchors)</option>
              </select>
            </div>

            <div className="dev-control">
              <label>
                Overlay Scaling: <strong>{settings.overlayScaleMode === 'scale-invariant' ? 'Fixed Size' : 'Scale with Zoom'}</strong>
              </label>
              <select
                value={settings.overlayScaleMode}
                onChange={(e) => updateSetting('overlayScaleMode', e.target.value as OverlayScaleMode)}
              >
                <option value="scale-invariant">Fixed Size (always readable)</option>
                <option value="scale-with-content">Scale with Zoom (like products)</option>
              </select>
            </div>

            <div className="dev-control">
              <label>
                Image Spread Direction: <strong>{settings.imageSpreadDirection === 'auto' ? 'Auto (aspect ratio)' : settings.imageSpreadDirection === 'horizontal' ? 'Horizontal' : 'Vertical'}</strong>
              </label>
              <select
                value={settings.imageSpreadDirection}
                onChange={(e) => updateSetting('imageSpreadDirection', e.target.value as ImageSpreadDirection)}
              >
                <option value="auto">Auto (based on aspect ratio)</option>
                <option value="horizontal">Horizontal (left/right)</option>
                <option value="vertical">Vertical (up/down)</option>
              </select>
            </div>
          </div>

          {/* Debug Options */}
          <div className="dev-section">
            <h4>🐛 Debug</h4>

            <div className="dev-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={settings.showDebugInfo}
                  onChange={(e) => updateSetting('showDebugInfo', e.target.checked)}
                />
                Show Debug Info
              </label>
            </div>

            <div className="dev-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={settings.showBoundingBoxes}
                  onChange={(e) => updateSetting('showBoundingBoxes', e.target.checked)}
                />
                Show Bounding Boxes
              </label>
            </div>
          </div>

          {/* Actions */}
          {/* Force Labels Configuration */}
          <div className="dev-section">
            <h4>🏷️ Force Labels (Hero Mode)</h4>

            <div className="dev-control">
              <label>
                Anchor Strength: <strong>{settings.forceLabelsConfig.anchorStrength.toFixed(3)}</strong>
              </label>
              <input
                type="range"
                min="0"
                max="2.0"
                step="0.01"
                value={settings.forceLabelsConfig.anchorStrength}
                onChange={(e) => updateForceLabelsConfig('anchorStrength', Number(e.target.value))}
              />
              <span className="dev-hint">How strongly labels are pulled to their anchor point (0-2.0)</span>
            </div>

            <div className="dev-control">
              <label>
                Repulsion Strength: <strong>{settings.forceLabelsConfig.repulsionStrength}</strong>
              </label>
              <input
                type="range"
                min="0"
                max="1000"
                step="10"
                value={settings.forceLabelsConfig.repulsionStrength}
                onChange={(e) => updateForceLabelsConfig('repulsionStrength', Number(e.target.value))}
              />
              <span className="dev-hint">How strongly labels push each other apart (0-1000)</span>
            </div>

            <div className="dev-control">
              <label>
                Repulsion Radius: <strong>{settings.forceLabelsConfig.repulsionRadius}px</strong>
              </label>
              <input
                type="range"
                min="0"
                max="800"
                step="10"
                value={settings.forceLabelsConfig.repulsionRadius}
                onChange={(e) => updateForceLabelsConfig('repulsionRadius', Number(e.target.value))}
              />
              <span className="dev-hint">Distance at which labels repel each other (0-800px)</span>
            </div>

            <div className="dev-control">
              <label>
                Min Distance: <strong>{settings.forceLabelsConfig.minDistance}px</strong>
              </label>
              <input
                type="range"
                min="0"
                max="400"
                step="5"
                value={settings.forceLabelsConfig.minDistance}
                onChange={(e) => updateForceLabelsConfig('minDistance', Number(e.target.value))}
              />
              <span className="dev-hint">Minimum distance from anchor point (0-400px)</span>
            </div>

            <div className="dev-control">
              <label>
                Max Distance: <strong>{settings.forceLabelsConfig.maxDistance}px</strong>
              </label>
              <input
                type="range"
                min="50"
                max="1000"
                step="10"
                value={settings.forceLabelsConfig.maxDistance}
                onChange={(e) => updateForceLabelsConfig('maxDistance', Number(e.target.value))}
              />
              <span className="dev-hint">Maximum distance from anchor point (50-1000px)</span>
            </div>

            <div className="dev-control">
              <label>
                Friction: <strong>{settings.forceLabelsConfig.friction.toFixed(3)}</strong>
              </label>
              <input
                type="range"
                min="0.1"
                max="0.99"
                step="0.01"
                value={settings.forceLabelsConfig.friction}
                onChange={(e) => updateForceLabelsConfig('friction', Number(e.target.value))}
              />
              <span className="dev-hint">Damping factor - higher = slower convergence (0.1-0.99)</span>
            </div>
          </div>

          <div className="dev-section">
            <div className="dev-buttons">
              <button onClick={resetToDefaults} className="dev-button">
                🔄 Reset to Defaults
              </button>
              <button onClick={exportSettings} className="dev-button">
                📋 Copy Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
