import { useState, useMemo } from 'react';
import { detectDataType, detectDistribution, getProductValue } from '../../gpane';
import type { Product } from '../../types/Product';
import { colors, card, table, badge, button, codeBlock } from './DokuStyles';

export function TypeDetectionSection({ products }: { products: Product[] }) {
  const [testValues, setTestValues] = useState('39.99, 59.99, 129.99, 89.99, 179.99');

  const detectedType = useMemo(() => {
    try {
      const parsed = testValues.split(',').map(v => {
        const trimmed = v.trim();
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (trimmed === 'null' || trimmed === '') return null;
        if (trimmed.startsWith('[')) return JSON.parse(trimmed);
        const num = Number(trimmed);
        return isNaN(num) ? trimmed : num;
      });
      return detectDataType(parsed);
    } catch {
      return 'error';
    }
  }, [testValues]);

  // Run detection on all real product properties
  const propertyDetection = useMemo(() => {
    if (products.length === 0) return [];
    const keys = new Set<string>();
    for (const p of products) {
      for (const k of Object.keys(p.attributes)) {
        keys.add(k);
      }
    }

    return Array.from(keys).map(key => {
      const values = products
        .map(p => getProductValue(p, key))
        .filter(v => v !== null && v !== undefined && v !== '');
      const type = detectDataType(values);
      const unique = new Set(values.map(String));

      let distribution: string | null = null;
      if (type === 'numeric_continuous' || type === 'numeric_discrete') {
        const nums = values.map(Number).filter(n => !isNaN(n));
        distribution = detectDistribution(nums);
      }

      return {
        key,
        type,
        distribution,
        cardinality: unique.size,
        sampleValues: Array.from(unique).slice(0, 5).join(', '),
        count: values.length,
        coverage: ((values.length / products.length) * 100).toFixed(0),
      };
    }).sort((a, b) => b.count - a.count);
  }, [products]);

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Type Detection</h1>
      <p style={{ color: colors.textMuted, marginBottom: '32px', lineHeight: '1.6' }}>
        Automatische Typ-Erkennung auf {products.length} echten O'Neal Produkten.
        Entscheidungsbaum: Array → Boolean → Numeric → String.
      </p>

      {/* Decision Tree */}
      <div style={card.container}>
        <div style={card.title}>Decision Tree</div>
        <pre style={codeBlock}>{`detectDataType(values[])
    │
    ├── All null? ────────────────────────→ identifier
    ├── First value is Array? ───────────→ multi_value
    ├── All boolean-like? ───────────────→ boolean
    ├── ≥80% valid numbers? ─────────────→ numeric
    │   ├── All integers AND ≤15 distinct → numeric_discrete
    │   └── Otherwise ──────────────────→ numeric_continuous
    └── String analysis:
        ├── ≥50% contain " > " or " / " → hierarchical
        ├── >80% unique AND >50 values ──→ identifier
        ├── >50 distinct values ─────────→ text
        └── ≤50 distinct values ─────────→ categorical`}</pre>
      </div>

      {/* Interactive Tester */}
      <div style={card.container}>
        <div style={card.title}>Interactive Type Tester</div>
        <textarea
          value={testValues}
          onChange={e => setTestValues(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            background: colors.bgCode,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            color: colors.text,
            fontFamily: 'inherit',
            fontSize: '12px',
            resize: 'vertical',
            minHeight: '60px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: colors.textMuted }}>Detected:</span>
          <span style={{
            ...badge(
              detectedType === 'error' ? colors.red : colors.accent,
              detectedType === 'error' ? colors.redDim : colors.bgHighlight,
            ),
            fontSize: '14px',
            padding: '4px 12px',
          }}>
            {detectedType}
          </span>
        </div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button style={button(false)} onClick={() => setTestValues('Jerseys, Pants, Helmets, Gloves, Boots')}>Categorical</button>
          <button style={button(false)} onClick={() => setTestValues('39.99, 59.99, 129.99, 89.99, 179.99, 249.99')}>Numeric Continuous</button>
          <button style={button(false)} onClick={() => setTestValues('2024, 2024, 2025, 2025, 2025')}>Numeric Discrete</button>
          <button style={button(false)} onClick={() => setTestValues('true, false, true, true, false')}>Boolean</button>
        </div>
      </div>

      {/* Live Detection on REAL Data */}
      <div style={card.container}>
        <div style={card.title}>Live Detection — {products.length} echte Produkte</div>
        <table style={table.container}>
          <thead>
            <tr>
              <th style={table.th}>Property</th>
              <th style={table.th}>Detected Type</th>
              <th style={table.th}>Distribution</th>
              <th style={table.th}>Card.</th>
              <th style={table.th}>Coverage</th>
              <th style={table.th}>Sample Values</th>
            </tr>
          </thead>
          <tbody>
            {propertyDetection.map(p => (
              <tr key={p.key}>
                <td style={table.td}><span style={{ fontWeight: 600 }}>{p.key}</span></td>
                <td style={table.td}><TypeBadge type={p.type} /></td>
                <td style={table.td}>
                  {p.distribution ? <span style={badge(colors.purple, colors.bgHighlight)}>{p.distribution}</span> : '—'}
                </td>
                <td style={table.td}>{p.cardinality}</td>
                <td style={table.td}>{p.coverage}%</td>
                <td style={{ ...table.td, fontSize: '11px', color: colors.textDim, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.sampleValues}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    hierarchical: [colors.accent, colors.bgHighlight],
    text: [colors.textMuted, colors.bgCode],
    identifier: [colors.textDim, colors.bgCode],
  };
  const [c, bg] = colorMap[type] || [colors.textMuted, colors.bgCode];
  return <span style={badge(c, bg)}>{type}</span>;
}
