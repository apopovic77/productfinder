import React from 'react';
import './DeveloperOverlay.css';

export type GridConfig = {
  spacing: number;
  margin: number;
  minCellSize: number;
  maxCellSize: number;
};

export type DeveloperSettings = {
  gridConfig: GridConfig;
  showDebugInfo: boolean;
  showBoundingBoxes: boolean;
  animationSpeed: number;
};

type DeveloperOverlayProps = {
  settings: DeveloperSettings;
  onSettingsChange: (settings: DeveloperSettings) => void;
  productCount: number;
  fps?: number;
  zoom?: number;
};

export const DeveloperOverlay: React.FC<DeveloperOverlayProps> = ({
  settings,
  onSettingsChange,
  productCount,
  fps = 0,
  zoom = 1
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);

  const updateGridConfig = (key: keyof GridConfig, value: number) => {
    onSettingsChange({
      ...settings,
      gridConfig: {
        ...settings.gridConfig,
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
        spacing: 12,
        margin: 20,
        minCellSize: 120,
        maxCellSize: 250
      },
      showDebugInfo: false,
      showBoundingBoxes: false,
      animationSpeed: 0.4
    });
  };

  const exportSettings = () => {
    const json = JSON.stringify(settings, null, 2);
    navigator.clipboard.writeText(json);
    alert('Settings copied to clipboard!');
  };

  if (!isOpen) {
    return (
      <button 
        className="dev-overlay-toggle"
        onClick={() => setIsOpen(true)}
        title="Open Developer Overlay"
      >
        🛠️
      </button>
    );
  }

  return (
    <div className={`dev-overlay ${isMinimized ? 'minimized' : ''}`}>
      <div className="dev-overlay-header">
        <h3>🛠️ Developer Overlay</h3>
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
            </div>
            <div style={{ 
              marginTop: '8px', 
              fontSize: '11px', 
              color: '#9ca3af',
              fontStyle: 'italic'
            }}>
              💡 Scroll to zoom (max 10x), Ctrl+Drag to pan
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
                Animation Speed: <strong>{settings.animationSpeed.toFixed(2)}</strong>
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.animationSpeed}
                onChange={(e) => updateSetting('animationSpeed', Number(e.target.value))}
              />
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

