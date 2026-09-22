import type { CatalogLocale } from '../config/CatalogEntryConfig';
import { FullModeToggle } from './FullModeToggle';
import './CatalogEntry.css';

/**
 * Serien-Stufe nach der Kategorie (Sonja Goldmann / owner 2026-09-22):
 * MX Helme → 1SRS · 2SRS · 3SRS … als Banner-Liste, wie die Kategorie-Seite.
 *
 * Die Serien sind KEINE eigene Taxonomie, sondern die erste Gruppierungs-
 * ebene des Finders (product_line) — ein Klick ist dieselbe Pivot-Action
 * wie ein Klick auf die Gruppe im Canvas. Kuratierte Serien-Banner gibt es
 * nicht, deshalb zeigt jedes Banner Produktbilder der Serie.
 */
export type SeriesGateEntry = {
  label: string;
  count: number;
  imageUrls: string[];
};

type SeriesSelectionGateProps = {
  locale: CatalogLocale;
  catalogYear: number;
  brand: string | null;
  sportLabel: string;
  categoryLabel: string;
  series: SeriesGateEntry[];
  totalCount: number;
  onSelect: (label: string) => void;
  onShowAll: () => void;
  onRequestCategorySelection: () => void;
  onRequestSportSelection: () => void;
  onRequestLanding: () => void;
};

const MESSAGES: Record<string, { chooseSeries: string; products: string; showAll: (n: number) => string }> = {
  de: { chooseSeries: 'Serie wählen', products: 'Produkte', showAll: n => `Alle ${n} Produkte anzeigen` },
  en: { chooseSeries: 'Choose a series', products: 'products', showAll: n => `Show all ${n} products` },
  fr: { chooseSeries: 'Choisir une série', products: 'produits', showAll: n => `Afficher les ${n} produits` },
  it: { chooseSeries: 'Scegli una serie', products: 'prodotti', showAll: n => `Mostra tutti i ${n} prodotti` },
  es: { chooseSeries: 'Elige una serie', products: 'productos', showAll: n => `Mostrar los ${n} productos` },
};

export function SeriesSelectionGate({
  locale,
  catalogYear,
  brand,
  sportLabel,
  categoryLabel,
  series,
  totalCount,
  onSelect,
  onShowAll,
  onRequestCategorySelection,
  onRequestSportSelection,
  onRequestLanding,
}: SeriesSelectionGateProps) {
  const text = MESSAGES[locale] ?? MESSAGES.en;
  return (
    <main className="pf-catalog-entry pf-series-gate">
      <FullModeToggle className="pf-series-gate-toggle" />
      <div className="pf-catalog-page">
        <nav className="pf-catalog-entry-breadcrumbs" aria-label="Catalog navigation">
          <button type="button" onClick={onRequestLanding}>Catalog {catalogYear}</button>
          {brand && <><span aria-hidden="true">›</span><span>{brand}</span></>}
          {sportLabel && <><span aria-hidden="true">›</span><button type="button" onClick={onRequestSportSelection}>{sportLabel}</button></>}
          <span aria-hidden="true">›</span>
          <button type="button" onClick={onRequestCategorySelection}>{categoryLabel}</button>
        </nav>
        <header className="pf-catalog-page-header">
          <span className="pf-catalog-page-kicker">{categoryLabel}</span>
          <h1 className="pf-catalog-page-title">{text.chooseSeries}</h1>
        </header>
        <div className="pf-catalog-category-list">
          {series.map(item => (
            <button
              type="button"
              className="pf-catalog-category-banner pf-catalog-series-banner"
              key={item.label}
              onClick={() => onSelect(item.label)}
            >
              <span className="pf-catalog-series-text">
                <span className="pf-catalog-category-name">{item.label}</span>
                <span className="pf-catalog-category-count">{item.count} {text.products}</span>
              </span>
              <span className="pf-catalog-series-images" aria-hidden="true">
                {item.imageUrls.map(url => <img key={url} src={url} alt="" loading="lazy" />)}
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="pf-catalog-series-all" onClick={onShowAll}>
          {text.showAll(totalCount)}
        </button>
      </div>
    </main>
  );
}
