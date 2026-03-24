import { useState, useEffect } from 'react';
import { GPANEEngine } from '../../gpane';
import type { PivotState } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, button, codeBlock, scoreBar, scoreBarFill } from './DokuStyles';

export function OverviewSection({ products }: { products: Product[] }) {
  const [engine] = useState(() => new GPANEEngine(ONEAL_CONFIG));
  const [state, setState] = useState<PivotState | null>(null);

  useEffect(() => {
    engine.load(products);
    setState(engine.getState());
  }, [products, engine]);

  if (!state) return null;

  const handlePivot = (key: string) => {
    engine.pivotTo(key);
    setState(engine.getState());
  };

  const handleFocus = (label: string) => {
    engine.focusBucket(label);
    setState(engine.getState());
  };

  const handleUnfocus = () => {
    engine.unfocus();
    setState(engine.getState());
  };

  const handleReset = () => {
    engine.reset();
    setState(engine.getState());
  };

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>
        GPANE — Generic Pivoting & Adaptive Navigation Engine
      </h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Echte Produktdaten aus der O'Neal API. {products.length} Produkte geladen.
        Pivoting reorganisiert — es entfernt nie Objekte.
      </p>

      {/* Iron Rule */}
      <div style={{ ...card.container, borderColor: colors.orange, background: colors.orangeDim }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: colors.orange, marginBottom: '8px' }}>
          IRON RULE
        </div>
        <p style={{ color: colors.text, margin: 0 }}>
          No object is ever lost through pivoting. Constraints (explicit filters) may reduce the set.
          Pivot/focus only reorganizes the view.
        </p>
      </div>

      {/* Live Engine State */}
      <div style={card.container}>
        <div style={card.title}>Live Engine — Echte O'Neal Produkte</div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <StatBox label="Total Objects" value={state.allObjects.length} />
          <StatBox label="Constrained" value={state.constrainedObjects.length} />
          <StatBox label="Focused" value={state.focusedObjects.length} />
          <StatBox label="Focus Depth" value={state.focusStack.length} />
          <StatBox label="Dimensions" value={state.availableDimensions.length} />
          <StatBox label="Buckets" value={state.buckets.length} />
        </div>

        {/* Active Dimension */}
        {state.activeDimension && (
          <div style={{ marginBottom: '20px' }}>
            <div style={card.subtitle}>Active Dimension</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: colors.accent, fontSize: '15px' }}>
                {state.activeDimension.label}
              </span>
              <span style={badge(colors.cyan, colors.blueDim)}>
                {state.activeDimension.dataType}
              </span>
              <span style={badge(colors.green, colors.greenDim)}>
                score: {state.activeDimension.score.total.toFixed(3)}
              </span>
              <span style={badge(colors.textMuted, colors.bgCode)}>
                {state.activeDimension.recommendedStrategy}
              </span>
            </div>
          </div>
        )}

        {/* Buckets */}
        <div style={{ marginBottom: '20px' }}>
          <div style={card.subtitle}>Buckets</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {state.buckets.map(b => (
              <div
                key={b.label}
                onClick={() => !b.isUnknown && handleFocus(b.label)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: `1px solid ${b.isUnknown ? colors.textDim : b.isOther ? colors.orange : colors.border}`,
                  background: b.isUnknown ? colors.bgCode : colors.bgHighlight,
                  cursor: b.isUnknown ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  fontSize: '12px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{b.label}</span>
                <span style={{ color: colors.textDim, marginLeft: '8px' }}>({b.count})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <button onClick={handleUnfocus} disabled={!state.focusStack.length} style={button(false)}>
            Unfocus
          </button>
          <button onClick={handleReset} style={button(false)}>
            Reset
          </button>
        </div>

        {/* Dimension Picker */}
        <div style={card.subtitle}>Available Dimensions (click to pivot)</div>
        <table style={table.container}>
          <thead>
            <tr>
              <th style={table.th}>Dimension</th>
              <th style={table.th}>Type</th>
              <th style={table.th}>Score</th>
              <th style={table.th}>Coverage</th>
              <th style={table.th}>Entropy</th>
              <th style={table.th}>Card.</th>
            </tr>
          </thead>
          <tbody>
            {state.availableDimensions.map(dim => (
              <tr
                key={dim.key}
                onClick={() => handlePivot(dim.key)}
                style={{
                  cursor: 'pointer',
                  background: dim.key === state.activeDimension?.key ? colors.bgHighlight : 'transparent',
                }}
              >
                <td style={table.td}>
                  <span style={{ fontWeight: dim.key === state.activeDimension?.key ? 700 : 400, color: dim.key === state.activeDimension?.key ? colors.accent : colors.text }}>
                    {dim.label}
                  </span>
                </td>
                <td style={table.td}>
                  <span style={badge(colors.cyan, colors.blueDim)}>{dim.dataType}</span>
                </td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                    <div style={{ ...scoreBar(dim.score.total, 1), flex: 1 }}>
                      <div style={scoreBarFill(dim.score.total, 1, dim.score.total > 0.5 ? colors.green : dim.score.total > 0.3 ? colors.orange : colors.red)} />
                    </div>
                    <span style={{ fontSize: '11px', color: colors.textMuted, minWidth: '40px' }}>
                      {dim.score.total.toFixed(3)}
                    </span>
                  </div>
                </td>
                <td style={table.td}>{(dim.coverage * 100).toFixed(0)}%</td>
                <td style={table.td}>{dim.entropy.toFixed(3)}</td>
                <td style={table.td}>{dim.cardinality}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Focus Stack */}
        {state.focusStack.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={card.subtitle}>Focus Stack</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {state.focusStack.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {i > 0 && <span style={{ color: colors.textDim }}>→</span>}
                  <span style={badge(colors.accent, colors.bgHighlight)}>
                    {entry.dimension}: {entry.bucketLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Architecture */}
      <div style={card.container}>
        <div style={card.title}>Pipeline Architecture</div>
        <pre style={codeBlock}>{`ProductRepository.fetchProducts()
    │
    ▼  Product[]
productsToDataObjects()
    │
    ▼  DataObject[]
┌──────────────┐
│  Analyzer    │  detectDataType() → analyzeProperties()
└──────┬───────┘
       ▼  PropertyAnalysis[]
┌──────────────┐
│  Scorer      │  scoreDimensions() — 7 weighted factors
└──────┬───────┘
       ▼  ScoredDimension[]
┌──────────────┐
│  Bucketer    │  buildBuckets() — 12 strategies
└──────┬───────┘
       ▼  Bucket[]
┌──────────────┐
│  Engine      │  GPANEEngine — focus, constraints, state
└──────────────┘`}</pre>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: colors.bgCode,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding: '10px 16px',
      minWidth: '100px',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: colors.accent }}>{value}</div>
      <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
  );
}
