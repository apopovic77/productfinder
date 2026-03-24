import { useMemo, useState } from 'react';
import { GPANEEngine } from '../../gpane';
import type { HierarchyDefinition } from '../../gpane';
import type { Product } from '../../types/Product';
import { ONEAL_CONFIG } from './SampleData';
import { colors, card, table, badge, codeBlock, scoreBar, scoreBarFill } from './DokuStyles';

export function HierarchySection({ products }: { products: Product[] }) {
  const [bonusPerLevel, setBonusPerLevel] = useState(0.3);

  const hierarchy: HierarchyDefinition = {
    name: 'Product Hierarchy',
    levels: ['presentation_category', 'product_line', 'design_group'],
    bonusPerLevel,
    strictOrder: false,
  };

  const engineWith = useMemo(() => {
    const e = new GPANEEngine({ ...ONEAL_CONFIG, hierarchies: [hierarchy] });
    e.load(products);
    return e;
  }, [products, bonusPerLevel]);

  const engineWithout = useMemo(() => {
    const e = new GPANEEngine({ ...ONEAL_CONFIG, hierarchies: [] });
    e.load(products);
    return e;
  }, [products]);

  const stateWith = engineWith.getState();
  const stateWithout = engineWithout.getState();

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Hierarchies</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Drill-Down Ketten zwischen Dimensionen. Nach Focus auf Bucket N bekommt Dimension N+1 einen Score-Bonus.
        Test mit {products.length} echten Produkten.
      </p>

      {/* Types */}
      <div style={card.container}>
        <div style={card.title}>Hierarchy Types</div>
        <table style={table.container}>
          <thead><tr><th style={table.th}>Type</th><th style={table.th}>Description</th><th style={table.th}>Example</th></tr></thead>
          <tbody>
            <tr>
              <td style={table.td}><span style={badge(colors.green, colors.greenDim)}>Explicit</span></td>
              <td style={table.td}>Path-Werte mit Separatoren ("Sports {'>'} MX {'>'} Jerseys")</td>
              <td style={table.td}><code style={{ color: colors.textMuted, fontSize: '11px' }}>hierarchical_drill</code></td>
            </tr>
            <tr>
              <td style={table.td}><span style={badge(colors.blue, colors.blueDim)}>Implicit</span></td>
              <td style={table.td}>Separate Properties verknüpft via Config</td>
              <td style={table.td}><code style={{ color: colors.textMuted, fontSize: '11px' }}>presentation_category → product_line → design_group</code></td>
            </tr>
            <tr>
              <td style={table.td}><span style={badge(colors.purple, colors.bgHighlight)}>Numeric</span></td>
              <td style={table.td}>Preis-Ranges können zoomen (subsplit)</td>
              <td style={table.td}><code style={{ color: colors.textMuted, fontSize: '11px' }}>canSubsplit()</code></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Config */}
      <div style={card.container}>
        <div style={card.title}>O'Neal Product Hierarchy</div>
        <pre style={codeBlock}>{`{
  name: "Product Hierarchy",
  levels: ["presentation_category", "product_line", "design_group"],
  bonusPerLevel: ${bonusPerLevel.toFixed(1)},
  strictOrder: false
}`}</pre>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ color: colors.textMuted, fontSize: '12px' }}>Bonus Per Level:</label>
          <input type="range" min="0" max="1" step="0.05" value={bonusPerLevel}
            onChange={e => setBonusPerLevel(Number(e.target.value))} style={{ width: '200px' }} />
          <span style={{ fontWeight: 700, color: colors.accent }}>{bonusPerLevel.toFixed(2)}</span>
        </div>
      </div>

      {/* Side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={card.container}>
          <div style={{ ...card.title, color: colors.textMuted }}>Ohne Hierarchy</div>
          <RankingTable dims={stateWithout.availableDimensions} />
        </div>
        <div style={{ ...card.container, borderColor: colors.accent }}>
          <div style={{ ...card.title, color: colors.accent }}>Mit Hierarchy</div>
          <RankingTable dims={stateWith.availableDimensions} showBonus />
        </div>
      </div>
    </div>
  );
}

function RankingTable({ dims, showBonus = false }: { dims: { key: string; label: string; score: { total: number; hierarchyBonus: number } }[]; showBonus?: boolean }) {
  return (
    <table style={table.container}>
      <thead>
        <tr>
          <th style={table.th}>#</th>
          <th style={table.th}>Dimension</th>
          <th style={table.th}>Score</th>
          {showBonus && <th style={table.th}>Bonus</th>}
        </tr>
      </thead>
      <tbody>
        {dims.map((dim, i) => (
          <tr key={dim.key} style={{ background: i === 0 ? colors.greenDim : 'transparent' }}>
            <td style={table.td}><span style={{ fontWeight: 700, color: i === 0 ? colors.green : colors.textDim }}>{i + 1}</span></td>
            <td style={table.td}>{dim.label}</td>
            <td style={table.td}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ ...scoreBar(dim.score.total, 1), width: '60px' }}>
                  <div style={scoreBarFill(dim.score.total)} />
                </div>
                <span style={{ fontSize: '10px' }}>{dim.score.total.toFixed(3)}</span>
              </div>
            </td>
            {showBonus && (
              <td style={table.td}>
                {dim.score.hierarchyBonus > 0
                  ? <span style={{ color: colors.green, fontWeight: 600 }}>+{dim.score.hierarchyBonus.toFixed(2)}</span>
                  : <span style={{ color: colors.textDim }}>—</span>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
