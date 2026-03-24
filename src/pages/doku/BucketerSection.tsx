import { useMemo, useState } from 'react';
import { analyzeProperties, buildBuckets } from '../../gpane';
import type { BucketStrategy } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, codeBlock, scoreBar, scoreBarFill } from './DokuStyles';

const STRATEGY_DESCRIPTIONS: Record<BucketStrategy, string> = {
  identity: 'Each unique value → one bucket. Overflow → "Sonstige".',
  range_equal_width: 'Equal-width numeric intervals from min to max.',
  range_quantile: 'Equal-frequency intervals (each bucket has ~same count).',
  range_logarithmic: 'Log-scale intervals for skewed data.',
  discrete: 'Each integer value → one bucket. Sorted numerically.',
  boolean_split: 'Two buckets: Ja/Nein.',
  multi_expansion: 'One bucket per array element. Objects may appear in multiple buckets.',
  hierarchical_drill: 'Level-by-level categorical.',
  text_token: 'First word of text → bucket label.',
  text_prefix: 'First 4 characters → bucket label.',
  text_keyword: 'First keyword (before comma/semicolon) → bucket label.',
  text_alphabetic: 'First letter → range group (A-D, E-H, ...).',
};

export function BucketerSection({ products }: { products: Product[] }) {
  const analyses = useMemo(() => analyzeProperties(products, ONEAL_CONFIG), [products]);
  const pivotCandidates = useMemo(() => analyses.filter(d => d.isPivotCandidate), [analyses]);

  const [selectedKey, setSelectedKey] = useState('');
  const [overrideStrategy, setOverrideStrategy] = useState<BucketStrategy | ''>('');
  const [maxBuckets, setMaxBuckets] = useState(ONEAL_CONFIG.maxBuckets);

  // Auto-select first candidate once loaded
  const effectiveKey = selectedKey || pivotCandidates[0]?.key || '';
  const selectedDim = pivotCandidates.find(d => d.key === effectiveKey) || pivotCandidates[0];

  const buckets = useMemo(() => {
    if (!selectedDim) return [];
    const dim = overrideStrategy
      ? { ...selectedDim, recommendedStrategy: overrideStrategy as BucketStrategy }
      : selectedDim;
    return buildBuckets(products, dim, { ...ONEAL_CONFIG, maxBuckets });
  }, [products, selectedDim, overrideStrategy, maxBuckets]);

  const totalInBuckets = buckets.reduce((a, b) => a + b.count, 0);

  if (!selectedDim) return <div style={{ color: colors.textMuted }}>Keine Pivot-Kandidaten gefunden.</div>;

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Bucket Builder</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Gruppierung von {products.length} echten Produkten. Jedes Objekt muss in einem Bucket landen.
      </p>

      {/* Strategy Overview */}
      <div style={card.container}>
        <div style={card.title}>12 Bucket Strategies</div>
        <table style={table.container}>
          <thead><tr><th style={table.th}>Strategy</th><th style={table.th}>Description</th></tr></thead>
          <tbody>
            {(Object.entries(STRATEGY_DESCRIPTIONS) as [BucketStrategy, string][]).map(([s, desc]) => (
              <tr key={s}>
                <td style={table.td}><span style={{ color: colors.cyan, fontWeight: 600, fontSize: '11px' }}>{s}</span></td>
                <td style={table.td}><span style={{ color: colors.textMuted, fontSize: '11px' }}>{desc}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Interactive Bucketer */}
      <div style={card.container}>
        <div style={card.title}>Interactive Bucket Builder — Echte Daten</div>

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '4px' }}>Dimension</div>
            <select value={effectiveKey}
              onChange={e => { setSelectedKey(e.target.value); setOverrideStrategy(''); }}
              style={{ padding: '6px 10px', background: colors.bgCode, border: `1px solid ${colors.border}`, borderRadius: '4px', color: colors.text, fontFamily: 'inherit', fontSize: '12px' }}>
              {pivotCandidates.map(d => (
                <option key={d.key} value={d.key}>{d.label} ({d.dataType})</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '4px' }}>Strategy Override</div>
            <select value={overrideStrategy}
              onChange={e => setOverrideStrategy(e.target.value as BucketStrategy | '')}
              style={{ padding: '6px 10px', background: colors.bgCode, border: `1px solid ${colors.border}`, borderRadius: '4px', color: colors.text, fontFamily: 'inherit', fontSize: '12px' }}>
              <option value="">Auto ({selectedDim?.recommendedStrategy})</option>
              {Object.keys(STRATEGY_DESCRIPTIONS).map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: colors.textDim, textTransform: 'uppercase', marginBottom: '4px' }}>Max Buckets</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="range" min="3" max="20" value={maxBuckets}
                onChange={e => setMaxBuckets(Number(e.target.value))} style={{ width: '100px' }} />
              <span style={{ fontWeight: 700, color: colors.accent }}>{maxBuckets}</span>
            </div>
          </div>
        </div>

        {/* Iron Rule Check */}
        <div style={{
          padding: '8px 14px', borderRadius: '6px', marginBottom: '16px',
          background: totalInBuckets >= products.length ? colors.greenDim : colors.redDim,
          border: `1px solid ${totalInBuckets >= products.length ? colors.green : colors.red}`,
          fontSize: '12px',
        }}>
          Iron Rule: {totalInBuckets} in buckets / {products.length} total —{' '}
          <strong style={{ color: totalInBuckets >= products.length ? colors.green : colors.red }}>
            {totalInBuckets >= products.length ? 'PASS' : 'FAIL'}
          </strong>
          {totalInBuckets > products.length && (
            <span style={{ color: colors.textMuted, marginLeft: '8px' }}>(multi-value overlap)</span>
          )}
        </div>

        {/* Bucket Visualization */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {buckets.map(b => {
            const maxCount = Math.max(...buckets.map(x => x.count));
            const pct = maxCount > 0 ? (b.count / maxCount) : 0;
            return (
              <div key={b.label} style={{
                flex: `0 0 ${Math.max(80, pct * 200)}px`,
                background: b.isUnknown ? colors.bgCode : b.isOther ? colors.orangeDim : colors.bgHighlight,
                border: `1px solid ${b.isUnknown ? colors.textDim : b.isOther ? colors.orange : colors.border}`,
                borderRadius: '6px', padding: '10px', textAlign: 'center',
              }}>
                <div style={{ fontWeight: 700, fontSize: '18px', color: colors.accent }}>{b.count}</div>
                <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px', wordBreak: 'break-word' }}>{b.label}</div>
                {b.range && <div style={{ fontSize: '9px', color: colors.textDim, marginTop: '2px' }}>[{b.range.min.toFixed(1)} – {b.range.max.toFixed(1)}]</div>}
              </div>
            );
          })}
        </div>

        {/* Bucket Details */}
        <table style={table.container}>
          <thead><tr>
            <th style={table.th}>Bucket</th><th style={table.th}>Count</th><th style={table.th}>Share</th><th style={table.th}>Range</th>
          </tr></thead>
          <tbody>
            {buckets.map(b => (
              <tr key={b.label}>
                <td style={table.td}>
                  <span style={{ fontWeight: 600 }}>{b.label}</span>
                  {b.isOther && <span style={{ color: colors.orange, marginLeft: '4px', fontSize: '10px' }}>(Sonstige)</span>}
                  {b.isUnknown && <span style={{ color: colors.textDim, marginLeft: '4px', fontSize: '10px' }}>(N/A)</span>}
                </td>
                <td style={table.td}>{b.count}</td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ ...scoreBar(b.count / products.length), width: '60px' }}><div style={scoreBarFill(b.count / products.length)} /></div>
                    <span style={{ fontSize: '10px', color: colors.textDim }}>{((b.count / products.length) * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td style={table.td}>{b.range ? `${b.range.min} – ${b.range.max}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
