import { useState, useCallback, useEffect } from 'react';
import { GPANEEngine } from '../../gpane';
import type { PivotState, Constraint } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, button, codeBlock } from './DokuStyles';

interface LogEntry {
  action: string;
  detail: string;
  objectCount: number;
  bucketCount: number;
}

export function EngineSection({ products }: { products: Product[] }) {
  const [engine] = useState(() => new GPANEEngine(ONEAL_CONFIG));
  const [state, setState] = useState<PivotState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    engine.load(products);
    setState(engine.getState());
    setLog([{ action: 'load', detail: `${products.length} Produkte geladen`, objectCount: products.length, bucketCount: engine.buckets.length }]);
  }, [products, engine]);

  const addLog = useCallback((action: string, detail: string) => {
    setLog(prev => [...prev, { action, detail, objectCount: engine.focusedProducts.length, bucketCount: engine.buckets.length }]);
  }, [engine]);

  const refresh = useCallback(() => setState(engine.getState()), [engine]);

  if (!state) return null;

  const handlePivot = (key: string) => { engine.pivotTo(key); addLog('pivotTo', key); refresh(); };
  const handleFocus = (label: string) => { engine.focusBucket(label); addLog('focusBucket', label); refresh(); };
  const handleUnfocus = () => { engine.unfocus(); addLog('unfocus', `depth → ${engine.focusDepth}`); refresh(); };
  const handleReset = () => { engine.reset(); addLog('reset', 'cleared'); refresh(); };

  const handleAddConstraint = () => {
    // Use first available dimension's top value as constraint
    const dim = state.availableDimensions[0];
    if (!dim || !dim.topValues[0]) return;
    const constraint: Constraint = { dimension: dim.key, operator: 'eq', value: dim.topValues[0].value };
    engine.addConstraint(constraint);
    addLog('addConstraint', `${dim.key} = ${dim.topValues[0].value}`);
    refresh();
  };

  const handleClearConstraints = () => { engine.clearConstraints(); addLog('clearConstraints', 'all removed'); refresh(); };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>GPANEEngine</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Kompletter Engine-Test mit {products.length} echten Produkten. Focus, Constraints, Navigation.
      </p>

      {/* API */}
      <div style={card.container}>
        <div style={card.title}>API</div>
        <pre style={codeBlock}>{`class GPANEEngine {
  load(products: DataObject[]): void
  pivotTo(dimensionKey: string): void
  focusBucket(bucketLabel: string): void
  unfocus(): void
  reset(): void
  addConstraint(constraint: Constraint): void
  clearConstraints(): void
  getState(): PivotState
}`}</pre>
      </div>

      {/* Interactive Console */}
      <div style={card.container}>
        <div style={card.title}>Engine Console</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Actions */}
          <div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Pivot To</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {state.availableDimensions.slice(0, 8).map(dim => (
                  <button key={dim.key} onClick={() => handlePivot(dim.key)} style={button(dim.key === state.activeDimension?.key)}>{dim.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Focus Bucket</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {state.buckets.filter(b => !b.isUnknown).slice(0, 10).map(b => (
                  <button key={b.label} onClick={() => handleFocus(b.label)} style={button(false)}>{b.label} ({b.count})</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Navigation</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={handleUnfocus} style={button(false)} disabled={!state.focusStack.length}>Unfocus</button>
                <button onClick={handleReset} style={button(false)}>Reset</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '6px' }}>Constraints</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={handleAddConstraint} style={button(false)}>+ Add Filter</button>
                <button onClick={handleClearConstraints} style={button(false)}>Clear</button>
              </div>
              {state.constraints.length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '11px' }}>
                  {state.constraints.map((c, i) => (
                    <div key={i} style={badge(colors.red, colors.redDim)}>{c.dimension} {c.operator} {String(c.value)}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* State */}
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <MiniStat label="All" value={state.allObjects.length} />
              <MiniStat label="Constrained" value={state.constrainedObjects.length} />
              <MiniStat label="Focused" value={state.focusedObjects.length} />
              <MiniStat label="Buckets" value={state.buckets.length} />
            </div>
            {state.activeDimension && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: colors.textDim, marginBottom: '4px' }}>ACTIVE</div>
                <span style={{ fontWeight: 700, color: colors.accent }}>{state.activeDimension.label}</span>
                <span style={{ marginLeft: '8px', color: colors.textDim, fontSize: '11px' }}>({state.activeDimension.score.total.toFixed(3)})</span>
              </div>
            )}
            {state.focusStack.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: colors.textDim, marginBottom: '4px' }}>FOCUS PATH</div>
                {state.focusStack.map((entry, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ color: colors.textDim, margin: '0 4px' }}>→</span>}
                    <span style={badge(colors.accent, colors.bgHighlight)}>{entry.dimension}: {entry.bucketLabel}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{
              padding: '8px', borderRadius: '4px', fontSize: '11px',
              background: state.focusedObjects.length <= state.constrainedObjects.length ? colors.greenDim : colors.redDim,
            }}>
              Iron Rule: {state.focusedObjects.length}/{state.constrainedObjects.length} visible
              {state.allObjects.length !== state.constrainedObjects.length && (
                <span style={{ color: colors.orange, marginLeft: '4px' }}>
                  ({state.allObjects.length - state.constrainedObjects.length} filtered)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Log */}
      <div style={card.container}>
        <div style={card.title}>Action Log</div>
        <div style={{ maxHeight: '300px', overflowY: 'auto', background: colors.bgCode, borderRadius: '6px', padding: '8px' }}>
          {log.map((entry, i) => (
            <div key={i} style={{ padding: '4px 8px', borderBottom: `1px solid ${colors.border}`, fontSize: '11px', display: 'flex', gap: '12px' }}>
              <span style={{ color: colors.textDim, minWidth: '30px' }}>#{i}</span>
              <span style={{ color: entry.action.includes('Constraint') ? colors.red : colors.accent, fontWeight: 600, minWidth: '120px' }}>{entry.action}</span>
              <span style={{ color: colors.textMuted, flex: 1 }}>{entry.detail}</span>
              <span style={{ color: colors.textDim }}>{entry.objectCount} obj, {entry.bucketCount} bkt</span>
            </div>
          ))}
        </div>
      </div>

      {/* Focus vs Constraint */}
      <div style={card.container}>
        <div style={card.title}>Focus vs. Constraint</div>
        <table style={table.container}>
          <thead><tr><th style={table.th}></th><th style={table.th}>Focus (Zoom)</th><th style={table.th}>Constraint (Filter)</th></tr></thead>
          <tbody>
            {[
              ['Objekte entfernt?', 'Nein — nur reorganisiert', 'Ja — gefiltert'],
              ['Reversibel?', 'unfocus()', 'removeConstraint()'],
              ['Objekt-Anzahl?', 'Ändert sich nicht', 'Ändert sich'],
              ['Re-Analyse?', 'Nur Re-Score', 'Volle Neuanalyse'],
            ].map(([l, f, c]) => (
              <tr key={l}>
                <td style={{ ...table.td, fontWeight: 600, color: colors.textMuted }}>{l}</td>
                <td style={{ ...table.td, color: colors.green }}>{f}</td>
                <td style={{ ...table.td, color: colors.red }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: colors.bgCode, borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 700, color: colors.accent }}>{value}</div>
      <div style={{ fontSize: '9px', color: colors.textDim, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}
