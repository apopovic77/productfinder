import { useMemo, useState } from 'react';
import { analyzeProperties } from '../../gpane';
import type { PropertyAnalysis, GPANEConfig } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, scoreBar, scoreBarFill } from './DokuStyles';

export function AnalyzerSection({ products }: { products: Product[] }) {
  const [minCoverage, setMinCoverage] = useState(ONEAL_CONFIG.minCoverage);

  const config: GPANEConfig = useMemo(() => ({
    ...ONEAL_CONFIG,
    minCoverage,
  }), [minCoverage]);

  const analyses = useMemo(() => analyzeProperties(products, config), [products, config]);
  const [selectedDim, setSelectedDim] = useState<PropertyAnalysis | null>(null);

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Property Analyzer</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Analyse von {products.length} echten Produkten. Coverage, Cardinality, Entropy, Distribution.
      </p>

      {/* Coverage Threshold */}
      <div style={card.container}>
        <div style={card.title}>Configuration</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <label style={{ color: colors.textMuted, fontSize: '12px' }}>Min Coverage:</label>
          <input type="range" min="0" max="1" step="0.05" value={minCoverage}
            onChange={e => setMinCoverage(Number(e.target.value))} style={{ width: '200px' }} />
          <span style={{ fontWeight: 700, color: colors.accent }}>{(minCoverage * 100).toFixed(0)}%</span>
          <span style={{ color: colors.textDim, fontSize: '11px' }}>({analyses.length} properties pass)</span>
        </div>
      </div>

      {/* Results Table */}
      <div style={card.container}>
        <div style={card.title}>Analysis Results ({analyses.length} properties)</div>
        <table style={table.container}>
          <thead>
            <tr>
              <th style={table.th}>Property</th>
              <th style={table.th}>Type</th>
              <th style={table.th}>Coverage</th>
              <th style={table.th}>Cardinality</th>
              <th style={table.th}>Entropy</th>
              <th style={table.th}>Distribution</th>
              <th style={table.th}>Strategy</th>
              <th style={table.th}>Pivot?</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map(dim => (
              <tr key={dim.key} onClick={() => setSelectedDim(dim)}
                style={{ cursor: 'pointer', background: selectedDim?.key === dim.key ? colors.bgHighlight : 'transparent' }}>
                <td style={table.td}>
                  <span style={{ fontWeight: 600 }}>{dim.label}</span>
                  <span style={{ color: colors.textDim, marginLeft: '6px', fontSize: '10px' }}>({dim.key})</span>
                </td>
                <td style={table.td}><TypeBadge type={dim.dataType} /></td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ ...scoreBar(dim.coverage), width: '60px' }}>
                      <div style={scoreBarFill(dim.coverage, 1, dim.coverage >= 0.9 ? colors.green : dim.coverage >= 0.5 ? colors.orange : colors.red)} />
                    </div>
                    <span style={{ fontSize: '11px' }}>{(dim.coverage * 100).toFixed(0)}%</span>
                  </div>
                </td>
                <td style={table.td}>{dim.cardinality}</td>
                <td style={table.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ ...scoreBar(dim.entropy), width: '60px' }}>
                      <div style={scoreBarFill(dim.entropy)} />
                    </div>
                    <span style={{ fontSize: '11px' }}>{dim.entropy.toFixed(3)}</span>
                  </div>
                </td>
                <td style={table.td}><span style={badge(colors.purple, colors.bgHighlight)}>{dim.distribution}</span></td>
                <td style={table.td}><span style={{ color: colors.cyan, fontSize: '11px' }}>{dim.recommendedStrategy}</span></td>
                <td style={table.td}>
                  {dim.isPivotCandidate ? <span style={{ color: colors.green }}>Yes</span> : <span style={{ color: colors.red }}>No</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {selectedDim && (
        <div style={{ ...card.container, borderColor: colors.borderActive }}>
          <div style={card.title}>
            Detail: {selectedDim.label}
            <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: '8px', fontSize: '12px' }}>({selectedDim.key})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <div style={card.subtitle}>Statistics</div>
              <table style={{ ...table.container, fontSize: '12px' }}>
                <tbody>
                  <StatRow label="Data Type" value={selectedDim.dataType} />
                  <StatRow label="Coverage" value={`${(selectedDim.coverage * 100).toFixed(1)}% (${selectedDim.totalCount - selectedDim.nullCount}/${selectedDim.totalCount})`} />
                  <StatRow label="Null Count" value={String(selectedDim.nullCount)} />
                  <StatRow label="Cardinality" value={String(selectedDim.cardinality)} />
                  <StatRow label="Entropy" value={selectedDim.entropy.toFixed(4)} />
                  <StatRow label="Distribution" value={selectedDim.distribution} />
                  <StatRow label="Strategy" value={selectedDim.recommendedStrategy} />
                  <StatRow label="Pivot Candidate" value={selectedDim.isPivotCandidate ? 'Yes' : 'No'} />
                </tbody>
              </table>
              {selectedDim.numericRange && (
                <div style={{ marginTop: '16px' }}>
                  <div style={card.subtitle}>Numeric Range</div>
                  <table style={{ ...table.container, fontSize: '12px' }}>
                    <tbody>
                      <StatRow label="Min" value={String(selectedDim.numericRange.min)} />
                      <StatRow label="Max" value={String(selectedDim.numericRange.max)} />
                      <StatRow label="Mean" value={String(selectedDim.numericRange.mean)} />
                      <StatRow label="Median" value={String(selectedDim.numericRange.median)} />
                      <StatRow label="StdDev" value={String(selectedDim.numericRange.stdDev)} />
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <div style={card.subtitle}>Top Values</div>
              <table style={table.container}>
                <thead><tr><th style={table.th}>Value</th><th style={table.th}>Count</th><th style={table.th}>Share</th></tr></thead>
                <tbody>
                  {selectedDim.topValues.map(tv => {
                    const total = selectedDim.totalCount - selectedDim.nullCount;
                    const share = total > 0 ? tv.count / total : 0;
                    return (
                      <tr key={tv.value}>
                        <td style={table.td}>{tv.value}</td>
                        <td style={table.td}>{tv.count}</td>
                        <td style={table.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ ...scoreBar(share), width: '80px' }}><div style={scoreBarFill(share)} /></div>
                            <span style={{ fontSize: '10px', color: colors.textDim }}>{(share * 100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, [string, string]> = {
    categorical: [colors.green, colors.greenDim],
    numeric_continuous: [colors.blue, colors.blueDim],
    numeric_discrete: [colors.cyan, colors.blueDim],
    boolean: [colors.orange, colors.orangeDim],
    multi_value: [colors.purple, colors.bgHighlight],
    text: [colors.textMuted, colors.bgCode],
    identifier: [colors.textDim, colors.bgCode],
  };
  const [c, bg] = colorMap[type] || [colors.textMuted, colors.bgCode];
  return <span style={badge(c, bg)}>{type}</span>;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...table.td, color: colors.textMuted, fontWeight: 600 }}>{label}</td>
      <td style={table.td}>{value}</td>
    </tr>
  );
}
