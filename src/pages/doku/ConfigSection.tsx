import { useState, useMemo } from 'react';
import { GPANEEngine, DEFAULT_CONFIG } from '../../gpane';
import type { GPANEConfig, PropertyOverride } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, codeBlock, scoreBar, scoreBarFill } from './DokuStyles';

export function ConfigSection({ products }: { products: Product[] }) {
  const [config, setConfig] = useState<GPANEConfig>({ ...ONEAL_CONFIG });

  const engine = useMemo(() => {
    const e = new GPANEEngine(config);
    e.load(products);
    return e;
  }, [products, config]);

  const state = engine.getState();

  const addOverride = (key: string, override: Partial<PropertyOverride>) => {
    setConfig(prev => ({ ...prev, overrides: { ...prev.overrides, [key]: { ...prev.overrides[key], ...override } } }));
  };

  const removeOverride = (key: string) => {
    setConfig(prev => {
      const overrides = { ...prev.overrides };
      delete overrides[key];
      return { ...prev, overrides };
    });
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Configuration</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Live Config-Editor auf {products.length} echten Produkten. Weights, Buckets, Overrides.
      </p>

      {/* O'Neal Config */}
      <div style={card.container}>
        <div style={card.title}>Aktive O'Neal Config</div>
        <pre style={codeBlock}>{JSON.stringify(ONEAL_CONFIG, null, 2)}</pre>
      </div>

      {/* Live Editor */}
      <div style={card.container}>
        <div style={card.title}>Live Config</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div style={{ background: colors.bgCode, borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Max Buckets</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="range" min="3" max="20" value={config.maxBuckets}
                onChange={e => setConfig(prev => ({ ...prev, maxBuckets: Number(e.target.value) }))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, color: colors.accent }}>{config.maxBuckets}</span>
            </div>
          </div>
          <div style={{ background: colors.bgCode, borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Min Coverage</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="range" min="0" max="1" step="0.05" value={config.minCoverage}
                onChange={e => setConfig(prev => ({ ...prev, minCoverage: Number(e.target.value) }))} style={{ flex: 1 }} />
              <span style={{ fontWeight: 700, color: colors.accent }}>{(config.minCoverage * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div style={{ background: colors.bgCode, borderRadius: '6px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Domain</div>
            <input type="text" value={config.domain}
              onChange={e => setConfig(prev => ({ ...prev, domain: e.target.value }))}
              style={{ width: '100%', padding: '4px 8px', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: '4px', color: colors.text, fontFamily: 'inherit', fontSize: '12px', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Quick Overrides */}
        <div style={card.subtitle}>Quick Overrides</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button onClick={() => addOverride('price', { strategy: 'range_quantile' })}
            style={{ ...badge(colors.blue, colors.blueDim), cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
            Price → Quantile
          </button>
          <button onClick={() => addOverride('presentation_category', { priority: 10 })}
            style={{ ...badge(colors.green, colors.greenDim), cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
            Kategorie Priority=10
          </button>
          <button onClick={() => addOverride('weight', { strategy: 'range_logarithmic' })}
            style={{ ...badge(colors.purple, colors.bgHighlight), cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
            Weight → Logarithmic
          </button>
          <button onClick={() => setConfig({ ...ONEAL_CONFIG })}
            style={{ ...badge(colors.red, colors.redDim), cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}>
            Reset to O'Neal Default
          </button>
        </div>

        {Object.keys(config.overrides).length > 0 && (
          <pre style={{ ...codeBlock, fontSize: '11px' }}>{JSON.stringify(config.overrides, null, 2)}</pre>
        )}
      </div>

      {/* Result */}
      <div style={card.container}>
        <div style={card.title}>
          Result ({state.availableDimensions.length} dims, {state.buckets.length} buckets)
        </div>
        <table style={table.container}>
          <thead><tr>
            <th style={table.th}>#</th><th style={table.th}>Dimension</th><th style={table.th}>Score</th>
            <th style={table.th}>Strategy</th><th style={table.th}>Override?</th>
          </tr></thead>
          <tbody>
            {state.availableDimensions.map((dim, i) => (
              <tr key={dim.key} style={{ background: i === 0 ? colors.greenDim : 'transparent' }}>
                <td style={table.td}><span style={{ fontWeight: 700, color: i === 0 ? colors.green : colors.textDim }}>{i + 1}</span></td>
                <td style={table.td}>{dim.label}</td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ ...scoreBar(dim.score.total, 1), width: '60px' }}><div style={scoreBarFill(dim.score.total)} /></div>
                    <span style={{ fontSize: '10px' }}>{dim.score.total.toFixed(3)}</span>
                  </div>
                </td>
                <td style={table.td}><span style={{ color: colors.cyan, fontSize: '11px' }}>{dim.recommendedStrategy}</span></td>
                <td style={table.td}>
                  {config.overrides[dim.key] ? <span style={badge(colors.orange, colors.orangeDim)}>yes</span> : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
