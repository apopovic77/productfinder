import { useState, useEffect } from 'react';
import { layout, sidebarLink, colors } from './doku/DokuStyles';
import { OverviewSection } from './doku/OverviewSection';
import { TypeDetectionSection } from './doku/TypeDetectionSection';
import { AnalyzerSection } from './doku/AnalyzerSection';
import { BucketerSection } from './doku/BucketerSection';
import { ScorerSection } from './doku/ScorerSection';
import { EngineSection } from './doku/EngineSection';
import { HierarchySection } from './doku/HierarchySection';
import { ConfigSection } from './doku/ConfigSection';
import { TaxonomySection } from './doku/TaxonomySection';
import { fetchProducts } from '../data/ProductRepository';
import type { Product } from '../types/Product';

type Section = 'taxonomy' | 'overview' | 'detection' | 'analyzer' | 'bucketer' | 'scorer' | 'engine' | 'hierarchy' | 'config';

const NAV_ITEMS: { id: Section; label: string; group?: string }[] = [
  { id: 'taxonomy', label: 'Taxonomy Navigation', group: 'Navigation' },
  { id: 'overview', label: 'Overview', group: 'GPANE' },
  { id: 'detection', label: 'Type Detection', group: 'Pipeline' },
  { id: 'analyzer', label: 'Property Analyzer' },
  { id: 'bucketer', label: 'Bucket Builder' },
  { id: 'scorer', label: 'Scoring Engine' },
  { id: 'engine', label: 'GPANEEngine', group: 'Engine' },
  { id: 'hierarchy', label: 'Hierarchies' },
  { id: 'config', label: 'Configuration' },
];

const SECTION_COMPONENTS: Record<Section, React.ComponentType<{ products: Product[] }>> = {
  taxonomy: TaxonomySection,
  overview: OverviewSection,
  detection: TypeDetectionSection,
  analyzer: AnalyzerSection,
  bucketer: BucketerSection,
  scorer: ScorerSection,
  engine: EngineSection,
  hierarchy: HierarchySection,
  config: ConfigSection,
};

export default function GpaneDoku() {
  const [activeSection, setActiveSection] = useState<Section>('taxonomy');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts({ limit: 10000 })
      .then(p => { setProducts(p); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  const ActiveComponent = SECTION_COMPONENTS[activeSection];

  return (
    <div style={layout.page}>
      <nav style={layout.sidebar}>
        <div style={layout.sidebarTitle}>GPANE Spec</div>
        {NAV_ITEMS.map(item => (
          <div key={item.id}>
            {item.group && <div style={layout.sidebarGroup}>{item.group}</div>}
            <a href="#" onClick={e => { e.preventDefault(); setActiveSection(item.id); }}
              style={sidebarLink(activeSection === item.id)}>{item.label}</a>
          </div>
        ))}
        <div style={{
          margin: '20px', padding: '10px 12px', borderRadius: '6px',
          background: loading ? colors.orangeDim : error ? colors.redDim : colors.greenDim,
          fontSize: '11px', color: loading ? colors.orange : error ? colors.red : colors.green, fontWeight: 600,
        }}>
          {loading ? 'Lade Produkte...' : error ? `Fehler: ${error}` : `${products.length} Produkte geladen`}
        </div>
        <div style={{ padding: '0 20px' }}>
          <a href="/" style={{ display: 'block', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${colors.border}`, color: colors.textMuted, textDecoration: 'none', fontSize: '11px', textAlign: 'center' }}>
            ← ProductFinder
          </a>
        </div>
        <div style={{ marginTop: '20px', padding: '16px 20px', borderTop: `1px solid ${colors.border}`, fontSize: '10px', color: colors.textDim, lineHeight: '1.6' }}>
          <div>GPANE v1.0</div>
          <div>Echte Product[] via fetchProducts()</div>
          <div>Gleicher ProductRepository</div>
        </div>
      </nav>
      <main style={layout.main}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: colors.textMuted }}>
            <div style={{ fontSize: '16px', marginBottom: '8px' }}>Lade Produktdaten...</div>
            <div style={{ fontSize: '12px', color: colors.textDim }}>fetchProducts(&#123; limit: 5000 &#125;)</div>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: colors.red }}>{error}</div>
        ) : (
          <ActiveComponent products={products} />
        )}
      </main>
    </div>
  );
}
