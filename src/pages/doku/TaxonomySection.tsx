import { useState, useEffect } from 'react';
import { GPANEEngine } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, button, codeBlock } from './DokuStyles';

/**
 * Full breadcrumb entry — tracks whether each level is taxonomy or GPANE.
 */
interface BreadcrumbEntry {
  label: string;
  type: 'root' | 'taxonomy' | 'gpane';
}

export function TaxonomySection({ products }: { products: Product[] }) {
  const [engine] = useState(() => new GPANEEngine(ONEAL_CONFIG));
  const [, setTick] = useState(0); // force re-render
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    engine.load(products);
    setLoaded(true);
    setTick(t => t + 1);
  }, [products, engine]);

  if (!loaded) return null;

  const refresh = () => setTick(t => t + 1);

  // Read engine state directly — no stale copies
  const mode = engine.mode;
  const taxPath = engine.taxonomyPath;
  const state = engine.getState();
  const currentNodes = engine.currentTaxonomyNodes;

  // Breadcrumbs: directly from engine's navigationStack — single source of truth
  const navStack = engine.navigationStack;
  const breadcrumbs: BreadcrumbEntry[] = [{ label: 'O\'Neal', type: 'root' }];

  for (const entry of navStack) {
    const dimInfo = entry.dimensionLabel
      ? (entry.source === 'taxonomy' ? `(${entry.dimensionLabel})` : `nach ${entry.dimensionLabel}`)
      : '';
    breadcrumbs.push({
      label: dimInfo ? `${entry.label} ${dimInfo}` : entry.label,
      type: entry.source,
    });
  }

  // === Handlers ===

  const handleTaxonomyClick = (slug: string) => {
    engine.taxonomyDrillDown(slug);
    refresh();
  };

  const handleFocus = (label: string) => {
    engine.focusBucket(label);
    refresh();
  };

  const handlePivotTo = (key: string) => {
    engine.pivotTo(key);
    refresh();
  };

  const handleBack = () => {
    engine.unfocus();
    refresh();
  };

  const handleReset = () => {
    engine.reset();
    refresh();
  };

  const handleBreadcrumbClick = (index: number) => {
    // index 0 = root → reset
    // index N = go back to that level
    if (index === 0) {
      engine.reset();
    } else {
      // How many levels to pop?
      const currentDepth = breadcrumbs.length - 1; // last entry = current level
      const levelsToPop = currentDepth - index;
      for (let i = 0; i < levelsToPop; i++) {
        engine.unfocus();
      }
    }
    refresh();
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Taxonomy Navigation</h1>
      <p style={{ color: colors.textMuted, marginBottom: '24px', lineHeight: '1.6' }}>
        Test: Taxonomy + GPANE Modus-Wechsel + Breadcrumb-Navigation.
        Gleiche Engine wie im ProductFinder.
      </p>

      {/* Mode Indicator */}
      <div style={{
        ...card.container,
        borderColor: mode === 'taxonomy' ? colors.blue : colors.accent,
        background: mode === 'taxonomy' ? colors.blueDim : colors.bgHighlight,
        padding: '12px 24px',
      }}>
        <span style={{
          ...badge(
            mode === 'taxonomy' ? colors.blue : colors.accent,
            mode === 'taxonomy' ? '#fff' : '#fff',
          ),
          fontSize: '13px',
          padding: '4px 12px',
        }}>
          {mode === 'taxonomy' ? 'TAXONOMY' : 'GPANE'}
        </span>
        <span style={{ color: colors.textMuted, fontSize: '12px', marginLeft: '12px' }}>
          {mode === 'taxonomy'
            ? `Fester Baum — ${currentNodes.length} Knoten`
            : `Auto-Scoring — gruppiert nach: ${state.activeDimension?.label || '?'}`}
        </span>
      </div>

      {/* Breadcrumbs + Navigation */}
      <div style={{ ...card.container, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Zurück + Reset */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button onClick={handleBack} disabled={state.focusStack.length === 0 && taxPath.length === 0} style={{ ...button(false), padding: '4px 10px', fontSize: '12px' }}>
            ←
          </button>
          <button onClick={handleReset} style={{ ...button(false), padding: '4px 10px', fontSize: '12px' }}>
            ⌂
          </button>
        </div>

        {/* Breadcrumbs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const isClickable = !isLast;
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {i > 0 && <span style={{ color: colors.textDim, fontSize: '12px' }}>›</span>}
                <span
                  onClick={isClickable ? () => handleBreadcrumbClick(i) : undefined}
                  style={{
                    cursor: isClickable ? 'pointer' : 'default',
                    fontWeight: isLast ? 700 : 400,
                    fontSize: '13px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: crumb.type === 'gpane'
                      ? colors.accent
                      : isLast ? colors.text : colors.textMuted,
                    background: crumb.type === 'gpane' ? colors.bgHighlight : 'transparent',
                    textDecoration: isClickable ? 'underline' : 'none',
                    textDecorationColor: colors.textDim,
                    textUnderlineOffset: '3px',
                  }}
                >
                  {crumb.label}
                </span>
                <span style={{
                  fontSize: '9px',
                  color: crumb.type === 'taxonomy' ? colors.blue : crumb.type === 'gpane' ? colors.accent : colors.textDim,
                  background: crumb.type === 'taxonomy' ? colors.blueDim : crumb.type === 'gpane' ? colors.bgHighlight : 'transparent',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontWeight: 600,
                }}>
                  {crumb.type === 'taxonomy' ? 'TAX' : crumb.type === 'gpane' ? 'GPANE' : ''}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <StatBox label="Total" value={state.allObjects.length} />
        <StatBox label="Focused" value={state.focusedObjects.length} />
        <StatBox label="Buckets" value={state.buckets.length} />
        <StatBox label="Focus Stack" value={state.focusStack.length} />
        <StatBox label="Tax Path" value={taxPath.length} />
      </div>

      {/* Buckets */}
      <div style={card.container}>
        <div style={card.title}>
          {mode === 'taxonomy' ? 'Kategorien' : `Buckets: ${state.activeDimension?.label || ''}`}
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {state.buckets.map(b => {
            const maxCount = Math.max(...state.buckets.map(x => x.count));
            const pct = maxCount > 0 ? b.count / maxCount : 0;
            const slug = mode === 'taxonomy'
              ? currentNodes.find(n => n.label === b.label)?.slug
              : null;

            return (
              <div
                key={b.label}
                onClick={() => {
                  if (mode === 'taxonomy' && slug) {
                    handleTaxonomyClick(slug);
                  } else if (!b.isUnknown) {
                    handleFocus(b.label);
                  }
                }}
                style={{
                  padding: '14px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${b.isUnknown ? colors.textDim : colors.border}`,
                  background: colors.bgCard,
                  cursor: b.isUnknown ? 'default' : 'pointer',
                  minWidth: `${Math.max(90, pct * 160)}px`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '22px', color: colors.accent }}>{b.count}</div>
                <div style={{ fontSize: '12px', color: colors.text, marginTop: '2px', fontWeight: 600 }}>{b.label}</div>
              </div>
            );
          })}
        </div>

        {/* Navigation buttons moved to breadcrumb bar */}
      </div>

      {/* Dimension Picker */}
      <div style={card.container}>
        <div style={card.title}>
          Dimensionen
          <span style={{ fontWeight: 400, color: colors.textDim, marginLeft: '8px', fontSize: '12px' }}>
            (Klick → wechselt zu GPANE)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {state.availableDimensions.slice(0, 12).map(dim => (
            <button
              key={dim.key}
              onClick={() => handlePivotTo(dim.key)}
              style={{
                ...button(mode === 'gpane' && dim.key === state.activeDimension?.key),
                fontSize: '11px',
              }}
            >
              {dim.label}
              <span style={{ color: colors.textDim, marginLeft: '4px' }}>
                ({dim.score.total.toFixed(2)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Engine State Debug */}
      <div style={card.container}>
        <div style={card.title}>Engine State (live)</div>
        <pre style={codeBlock}>{`mode: ${mode}
taxonomyPath: [${taxPath.map(n => n.label).join(' → ')}]
focusStack: [${state.focusStack.map(f => `${f.dimension}:${f.bucketLabel}`).join(' → ')}]
activeDimension: ${state.activeDimension?.key || 'null'}
currentTaxonomyNodes: [${currentNodes.map(n => n.label).join(', ')}]
buckets: [${state.buckets.map(b => `${b.label}(${b.count})`).join(', ')}]
focusedObjects: ${state.focusedObjects.length}
scoredDimensions: [${state.availableDimensions.slice(0, 5).map(d => `${d.key}:${d.score.total.toFixed(2)}`).join(', ')}]`}</pre>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: colors.bgCard,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding: '10px 16px',
      minWidth: '80px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color: colors.accent }}>{value}</div>
      <div style={{ fontSize: '9px', color: colors.textDim, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}
