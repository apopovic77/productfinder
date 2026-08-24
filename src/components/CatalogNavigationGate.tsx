import React, { useEffect, useMemo, useState } from 'react';
import {
  CATALOG_ENTRY_CONFIG,
  getLocalizedLabel,
  type CatalogEntrySelection,
  type CatalogLocale,
} from '../config/CatalogEntryConfig';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { fetchProducts } from '../data/ProductRepository';
import type { Product } from '../types/Product';
import { countCatalogCategoryProducts, getCatalogCategory, getCatalogSport } from '../utils/catalogEntry';
import { readCatalogQuery, writeCatalogUrl } from '../utils/catalogEntryUrl';
import './CatalogEntry.css';

export type CatalogNavigationContext = {
  selection: CatalogEntrySelection;
  sportLabel: string;
  categoryLabel: string;
  requestSportSelection: () => void;
  requestCategorySelection: () => void;
};

type Props = {
  brand: string;
  locale: CatalogLocale;
  canChangeBrand: boolean;
  onRequestBrandSelection: () => void;
  onRequestLanding: () => void;
  children: (context: CatalogNavigationContext) => React.ReactNode;
};

const messages: Record<string, Record<string, string>> = {
  de: {
    chooseSport: 'Wähle deinen Sport',
    chooseCategory: 'Wähle deine Produktkategorie',
    comingSoon: 'Demnächst',
    products: 'Produkte',
    unavailable: 'Nicht verfügbar',
    loading: 'Kategorien werden geladen…',
    retry: 'Erneut versuchen',
  },
  en: {
    chooseSport: 'Choose your sport',
    chooseCategory: 'Choose your product category',
    comingSoon: 'Coming soon',
    products: 'products',
    unavailable: 'Unavailable',
    loading: 'Loading categories…',
    retry: 'Try again',
  },
  // fr/it/es fell back to English although the catalog offers these
  // languages (issue #1308).
  fr: {
    chooseSport: 'Choisis ton sport',
    chooseCategory: 'Choisis ta catégorie de produits',
    comingSoon: 'Bientôt disponible',
    products: 'produits',
    unavailable: 'Indisponible',
    loading: 'Chargement des catégories…',
    retry: 'Réessayer',
  },
  it: {
    chooseSport: 'Scegli il tuo sport',
    chooseCategory: 'Scegli la tua categoria di prodotti',
    comingSoon: 'Prossimamente',
    products: 'prodotti',
    unavailable: 'Non disponibile',
    loading: 'Caricamento delle categorie…',
    retry: 'Riprova',
  },
  es: {
    chooseSport: 'Elige tu deporte',
    chooseCategory: 'Elige tu categoría de productos',
    comingSoon: 'Próximamente',
    products: 'productos',
    unavailable: 'No disponible',
    loading: 'Cargando categorías…',
    retry: 'Reintentar',
  },
};

export const CatalogNavigationGate: React.FC<Props> = ({
  brand,
  locale,
  canChangeBrand,
  onRequestBrandSelection,
  onRequestLanding,
  children,
}) => {
  const [, setLocationVersion] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const text = messages[locale] ?? messages.en;

  useEffect(() => {
    const onLocationChange = () => setLocationVersion(version => version + 1);
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('cataloglocationchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('cataloglocationchange', onLocationChange);
    };
  }, []);

  const query = readCatalogQuery(window.location.href);
  const sport = query.sport ? getCatalogSport(query.sport) : undefined;
  const category = sport && query.category ? getCatalogCategory(sport.id, query.category) : undefined;

  useEffect(() => {
    if (query.sport && !sport?.enabled) {
      writeCatalogUrl({ sport: null, category: null }, 'replace');
      return;
    }
    if (sport?.enabled && query.category && !category) {
      writeCatalogUrl({ category: null }, 'replace');
    }
  }, [category, query.category, query.sport, sport]);

  useEffect(() => {
    if (!sport?.enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setHasLoadedProducts(false);
    setError(null);
    fetchProducts({ limit: 10000, brand })
      .then(result => {
        if (!cancelled) {
          setProducts(result);
          setHasLoadedProducts(true);
        }
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load catalog.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [brand, sport?.id, sport?.enabled, reloadKey]);

  const categoryCounts = useMemo(() => {
    if (!sport) return new Map<string, number>();
    return new Map((CATALOG_ENTRY_CONFIG.categoriesBySport[sport.id] ?? []).map(item => [
      item.id,
      countCatalogCategoryProducts(products, sport.id, item.id),
    ]));
  }, [products, sport]);

  useEffect(() => {
    if (!category || !hasLoadedProducts) return;
    if ((categoryCounts.get(category.id) ?? 0) === 0) {
      writeCatalogUrl({ category: null }, 'replace');
    }
  }, [category, categoryCounts, hasLoadedProducts]);

  const breadcrumbs = (tail?: React.ReactNode) => (
    <nav className="pf-catalog-entry-breadcrumbs" aria-label="Catalog navigation">
      <button type="button" onClick={onRequestLanding}>Catalog {CATALOG_ENTRY_CONFIG.year}</button>
      <span aria-hidden="true">›</span>
      <button type="button" disabled={!canChangeBrand} onClick={canChangeBrand ? onRequestBrandSelection : undefined}>{brand}</button>
      {tail}
    </nav>
  );

  if (!sport?.enabled) {
    return (
      <main className="pf-catalog-entry">
        <div className="pf-catalog-page">
          {breadcrumbs()}
          <header className="pf-catalog-page-header">
            <span className="pf-catalog-page-kicker">Catalog {CATALOG_ENTRY_CONFIG.year}</span>
            <h1 className="pf-catalog-page-title">{text.chooseSport}</h1>
          </header>
          <div className="pf-catalog-sport-grid">
            {CATALOG_ENTRY_CONFIG.sports.map(item => {
              const bannerUrl = item.banner?.url ?? (item.banner?.storageId
                ? `${STORAGE_API_BASE}/storage/media/${item.banner.storageId}?format=webp&width=1600`
                : undefined);
              return (
                <button
                  type="button"
                  className={`pf-catalog-sport-card ${bannerUrl ? 'has-banner' : ''}`}
                  key={item.id}
                  disabled={!item.enabled}
                  onClick={() => writeCatalogUrl({ sport: item.id, category: null })}
                  style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundPosition: item.banner?.position ?? 'center' } : undefined}
                >
                  {item.comingSoon && <span className="pf-catalog-coming-soon">{text.comingSoon}</span>}
                  <span className="pf-catalog-sport-name">{getLocalizedLabel(item.labels, locale)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  if (isLoading && products.length === 0) {
    return <main className="pf-catalog-entry pf-catalog-entry-state"><p>{text.loading}</p></main>;
  }

  if (error) {
    return (
      <main className="pf-catalog-entry pf-catalog-entry-state" role="alert">
        <div><p>{error}</p><button type="button" onClick={() => setReloadKey(key => key + 1)}>{text.retry}</button></div>
      </main>
    );
  }

  const selectedCount = category ? categoryCounts.get(category.id) ?? 0 : 0;
  if (!category || selectedCount === 0) {
    const sportLabel = getLocalizedLabel(sport.labels, locale);
    return (
      <main className="pf-catalog-entry">
        <div className="pf-catalog-page">
          {breadcrumbs(<><span aria-hidden="true">›</span><button type="button" onClick={() => writeCatalogUrl({ sport: null, category: null })}>{sportLabel}</button></>)}
          <header className="pf-catalog-page-header">
            <span className="pf-catalog-page-kicker">{sportLabel}</span>
            <h1 className="pf-catalog-page-title">{text.chooseCategory}</h1>
          </header>
          <div className="pf-catalog-category-list">
            {(CATALOG_ENTRY_CONFIG.categoriesBySport[sport.id] ?? []).map(item => {
              const count = categoryCounts.get(item.id) ?? 0;
              const bannerUrl = item.banner?.url ?? (item.banner?.storageId
                ? `${STORAGE_API_BASE}/storage/media/${item.banner.storageId}?format=webp&width=1600`
                : undefined);
              return (
                <button
                  type="button"
                  className="pf-catalog-category-banner"
                  key={item.id}
                  disabled={count === 0}
                  onClick={() => writeCatalogUrl({ category: item.id })}
                  style={bannerUrl ? { backgroundImage: `url(${bannerUrl})`, backgroundPosition: item.banner?.position ?? 'center 35%' } : undefined}
                >
                  <span className="pf-catalog-category-name">{getLocalizedLabel(item.labels, locale)}</span>
                  <span className="pf-catalog-category-count">{count > 0 ? `${count} ${text.products}` : text.unavailable}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  return <>{children({
    selection: { sportId: sport.id, categoryId: category.id },
    sportLabel: getLocalizedLabel(sport.labels, locale),
    categoryLabel: getLocalizedLabel(category.labels, locale),
    requestSportSelection: () => writeCatalogUrl({ sport: null, category: null }),
    requestCategorySelection: () => writeCatalogUrl({ category: null }),
  })}</>;
};
