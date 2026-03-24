import { useMemo, useState } from 'react';
import { GPANEEngine } from '../../gpane';
import type { ScoredDimension, ScoringWeights } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, scoreBar, scoreBarFill, codeBlock } from './DokuStyles';

const FACTORS: Record<keyof ScoringWeights, { label: string; desc: string; color: string; isPenalty: boolean }> = {
  coverage: { label: 'Coverage', desc: 'Wie viele Objekte haben diese Property?', color: colors.green, isPenalty: false },
  diversity: { label: 'Diversity', desc: 'Wie gut differenziert diese Dimension? (Entropy x Cardinality)', color: colors.blue, isPenalty: false },
  informationGain: { label: 'Information Gain', desc: 'Reduziert Splitting die Unsicherheit anderer Dimensionen?', color: colors.cyan, isPenalty: false },
  usability: { label: 'Usability', desc: 'Benutzerfreundliche Bucket-Anzahl? Sweet spot: 3-10.', color: colors.purple, isPenalty: false },
  redundancy: { label: 'Redundancy', desc: 'Wie ähnlich zur aktiven Dimension? (Jaccard overlap)', color: colors.red, isPenalty: true },
  history: { label: 'History', desc: 'Kürzlich verwendet? Exponential decay penalty.', color: colors.orange, isPenalty: true },
  fragmentation: { label: 'Fragmentation', desc: 'Zu viele kleine Buckets (< 3 Objekte)?', color: colors.orange, isPenalty: true },
};

export function ScorerSection({ products }: { products: Product[] }) {
  const [weights, setWeights] = useState<ScoringWeights>({ ...ONEAL_CONFIG.scoring });

  const engine = useMemo(() => {
    const e = new GPANEEngine({ ...ONEAL_CONFIG, scoring: weights });
    e.load(products);
    return e;
  }, [products, weights]);

  const dims = engine.scoredDimensions;
  const [selectedDim, setSelectedDim] = useState<ScoredDimension | null>(null);

  const updateWeight = (key: keyof ScoringWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Scoring Engine</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        7 gewichtete Faktoren auf {products.length} echten Produkten. Weights live anpassen.
      </p>

      {/* Formula */}
      <div style={card.container}>
        <div style={card.title}>Score Formula</div>
        <pre style={codeBlock}>{`Total = Coverage × w₁ + Diversity × w₂ + IG × w₃ + Usability × w₄
      − Redundancy × w₅ − History × w₆ − Fragmentation × w₇
      + HierarchyBonus`}</pre>
      </div>

      {/* Weight Sliders */}
      <div style={card.container}>
        <div style={card.title}>Weights (live)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {(Object.entries(FACTORS) as [keyof ScoringWeights, typeof FACTORS[keyof ScoringWeights]][]).map(([key, info]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: colors.bgCode, borderRadius: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: info.color, minWidth: '120px' }}>
                {info.isPenalty ? '−' : '+'} {info.label}
              </span>
              <input type="range" min="0" max="1" step="0.05" value={weights[key]}
                onChange={e => updateWeight(key, Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: colors.accent, minWidth: '32px', textAlign: 'right' }}>
                {weights[key].toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rankings */}
      <div style={card.container}>
        <div style={card.title}>Dimension Rankings</div>
        <table style={table.container}>
          <thead>
            <tr>
              <th style={table.th}>#</th>
              <th style={table.th}>Dimension</th>
              <th style={table.th}>Total</th>
              {Object.keys(FACTORS).map(k => (
                <th key={k} style={{ ...table.th, fontSize: '9px', padding: '6px 4px' }}>
                  {FACTORS[k as keyof ScoringWeights].label.slice(0, 5)}
                </th>
              ))}
              <th style={{ ...table.th, fontSize: '9px' }}>Hier.</th>
            </tr>
          </thead>
          <tbody>
            {dims.map((dim, i) => (
              <tr key={dim.key} onClick={() => setSelectedDim(dim)}
                style={{ cursor: 'pointer', background: selectedDim?.key === dim.key ? colors.bgHighlight : i === 0 ? colors.greenDim : 'transparent' }}>
                <td style={table.td}><span style={{ fontWeight: 700, color: i === 0 ? colors.green : colors.textDim }}>{i + 1}</span></td>
                <td style={table.td}><span style={{ fontWeight: 600 }}>{dim.label}</span></td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ ...scoreBar(dim.score.total, 1), width: '80px' }}>
                      <div style={scoreBarFill(dim.score.total, 1, dim.score.total > 0.5 ? colors.green : dim.score.total > 0.3 ? colors.orange : colors.red)} />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{dim.score.total.toFixed(3)}</span>
                  </div>
                </td>
                <ScoreCell value={dim.score.coverage} color={FACTORS.coverage.color} />
                <ScoreCell value={dim.score.diversity} color={FACTORS.diversity.color} />
                <ScoreCell value={dim.score.informationGain} color={FACTORS.informationGain.color} />
                <ScoreCell value={dim.score.usability} color={FACTORS.usability.color} />
                <ScoreCell value={dim.score.redundancy} color={FACTORS.redundancy.color} isPenalty />
                <ScoreCell value={dim.score.history} color={FACTORS.history.color} isPenalty />
                <ScoreCell value={dim.score.fragmentation} color={FACTORS.fragmentation.color} isPenalty />
                <td style={{ ...table.td, fontSize: '10px', color: dim.score.hierarchyBonus > 0 ? colors.green : colors.textDim }}>
                  {dim.score.hierarchyBonus > 0 ? `+${dim.score.hierarchyBonus.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail */}
      {selectedDim && (
        <div style={{ ...card.container, borderColor: colors.borderActive }}>
          <div style={card.title}>Score Breakdown: {selectedDim.label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {(Object.entries(FACTORS) as [keyof ScoringWeights, typeof FACTORS[keyof ScoringWeights]][]).map(([key, info]) => {
              const raw = selectedDim.score[key as keyof typeof selectedDim.score] as number;
              const weighted = raw * weights[key] * (info.isPenalty ? -1 : 1);
              return (
                <div key={key} style={{ background: colors.bgCode, borderRadius: '6px', padding: '12px', border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: info.color, marginBottom: '4px' }}>
                    {info.isPenalty ? '−' : '+'} {info.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700 }}>{raw.toFixed(3)}</span>
                    <span style={{ fontSize: '11px', color: colors.textDim }}>× {weights[key].toFixed(2)} = {weighted > 0 ? '+' : ''}{weighted.toFixed(3)}</span>
                  </div>
                  <div style={scoreBar(raw)}><div style={scoreBarFill(raw, 1, info.color)} /></div>
                  <div style={{ fontSize: '10px', color: colors.textDim, marginTop: '6px' }}>{info.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCell({ value, color, isPenalty = false }: { value: number; color: string; isPenalty?: boolean }) {
  return (
    <td style={{ ...table.td, fontSize: '10px', padding: '6px 4px' }}>
      <span style={{ color: value > 0.5 ? color : colors.textDim, fontWeight: value > 0.5 ? 600 : 400 }}>
        {isPenalty && value > 0 ? '-' : ''}{value.toFixed(2)}
      </span>
    </td>
  );
}
