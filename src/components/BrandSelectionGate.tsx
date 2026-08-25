import React, { useCallback, useEffect, useState } from 'react';
import { fetchFacets } from '../data/ProductRepository';
import { BRAND_BANNERS } from '../config/CatalogEntryConfig';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { buildBrandUrl, resolveBrandEntry, type BrandFacet } from '../utils/brandSelection';
import './BrandSelectionGate.css';

export type BrandSelectionContext = {
  /** null = Marken-Gate ist in der Flow-Variante deaktiviert (alle Marken) */
  brand: string | null;
  canChangeBrand: boolean;
  requestBrandSelection: () => void;
};

type Props = {
  locale?: string;
  /** false = Gate überspringen, alle Marken laden (Flow-Variante 'open'/'direct') */
  enabled?: boolean;
  children: (context: BrandSelectionContext) => React.ReactNode;
};

function updateBrandUrl(
  brand: string | null,
  mode: 'push' | 'replace',
  clearDependents = false,
): void {
  const nextUrl = buildBrandUrl(window.location.href, brand, { clearDependents });
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](
    { brand },
    '',
    nextUrl,
  );
}

const messages: Record<string, Record<string, string>> = {
  de: {
    loading: 'Marken werden geladen…',
    empty: 'Aktuell sind keine Marken verfügbar.',
    failed: 'Marken konnten nicht geladen werden.',
    retry: 'Erneut versuchen',
    kicker: 'Katalog',
    title: 'Wähle deine Marke',
    subtitle: 'Wähle die Kollektion, die du entdecken möchtest.',
    products: 'Produkte',
    action: 'Kollektion öffnen',
  },
  en: {
    loading: 'Loading brands…',
    empty: 'No brands are currently available.',
    failed: 'Could not load brands.',
    retry: 'Try again',
    kicker: 'Catalog',
    title: 'Choose your brand',
    subtitle: 'Choose the collection you want to explore.',
    products: 'products',
    action: 'Explore collection',
  },
  fr: {
    loading: 'Chargement des marques…',
    empty: 'Aucune marque disponible pour le moment.',
    failed: 'Impossible de charger les marques.',
    retry: 'Réessayer',
    kicker: 'Catalogue',
    title: 'Choisis ta marque',
    subtitle: 'Choisis la collection que tu veux découvrir.',
    products: 'produits',
    action: 'Ouvrir la collection',
  },
  it: {
    loading: 'Caricamento dei marchi…',
    empty: 'Nessun marchio disponibile al momento.',
    failed: 'Impossibile caricare i marchi.',
    retry: 'Riprova',
    kicker: 'Catalogo',
    title: 'Scegli il tuo marchio',
    subtitle: 'Scegli la collezione che vuoi scoprire.',
    products: 'prodotti',
    action: 'Apri la collezione',
  },
  es: {
    loading: 'Cargando marcas…',
    empty: 'No hay marcas disponibles actualmente.',
    failed: 'No se pudieron cargar las marcas.',
    retry: 'Reintentar',
    kicker: 'Catálogo',
    title: 'Elige tu marca',
    subtitle: 'Elige la colección que quieres descubrir.',
    products: 'productos',
    action: 'Abrir la colección',
  },
};

export const BrandSelectionGate: React.FC<Props> = ({ children, locale = 'en', enabled = true }) => {
  const text = messages[locale] ?? messages.en;
  const [brands, setBrands] = useState<BrandFacet[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const applyLocation = useCallback((availableBrands: readonly BrandFacet[]) => {
    const requestedBrand = new URLSearchParams(window.location.search).get('brand');
    const resolution = resolveBrandEntry(availableBrands, requestedBrand);
    setSelectedBrand(resolution.selectedBrand);
    setShowSelector(resolution.showSelector);
    if (resolution.autoSelected && resolution.selectedBrand) {
      updateBrandUrl(resolution.selectedBrand, 'replace');
    } else if (requestedBrand && resolution.showSelector) {
      updateBrandUrl(null, 'replace', true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchFacets()
      .then(data => {
        if (cancelled) return;
        const availableBrands = Array.isArray(data?.brands)
          ? data.brands.filter((brand: unknown): brand is BrandFacet => {
              const candidate = brand as Partial<BrandFacet>;
              return typeof candidate.name === 'string'
                && typeof candidate.count_with_image === 'number';
            })
          : [];
        setBrands(availableBrands);
        applyLocation(availableBrands);
        if (availableBrands.length === 0) setError(text.empty);
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : text.failed);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [applyLocation, enabled, reloadKey, text.empty, text.failed]);

  useEffect(() => {
    const handlePopState = () => applyLocation(brands);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyLocation, brands]);

  const chooseBrand = (brand: string) => {
    updateBrandUrl(brand, 'replace', true);
    setSelectedBrand(brand);
    setShowSelector(false);
  };

  const requestBrandSelection = () => {
    if (brands.length <= 1) return;
    updateBrandUrl(null, 'push', true);
    setSelectedBrand(null);
    setShowSelector(true);
  };

  if (!enabled) {
    return <>{children({ brand: null, canChangeBrand: false, requestBrandSelection: () => {} })}</>;
  }

  if (isLoading) {
    return (
      <main className="pf-brand-entry pf-brand-entry-state" aria-live="polite">
        <div className="pf-brand-entry-spinner" />
        <p>{text.loading}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pf-brand-entry pf-brand-entry-state" role="alert">
        <p>{error}</p>
        <button type="button" className="pf-brand-retry" onClick={() => setReloadKey(key => key + 1)}>{text.retry}</button>
      </main>
    );
  }

  if (showSelector || !selectedBrand) {
    return (
      <main className="pf-brand-entry">
        <div className="pf-brand-entry-copy">
          <span className="pf-brand-entry-kicker">{text.kicker}</span>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </div>
        <div className="pf-brand-grid" aria-label="Available brands">
          {brands.map(brand => {
            const banner = BRAND_BANNERS[brand.name];
            const bannerUrl = banner?.url ?? (banner?.storageId
              ? `${STORAGE_API_BASE}/storage/media/${banner.storageId}?format=webp&width=1200&trim=true`
              : undefined);
            return (
              <button
                type="button"
                className={`pf-brand-card ${bannerUrl ? `has-banner fit-${banner?.fit ?? 'cover'}` : ''}`}
                key={brand.name}
                onClick={() => chooseBrand(brand.name)}
                style={bannerUrl ? {
                  backgroundImage: banner?.fit === 'contain'
                    ? `url(${bannerUrl})`
                    : `linear-gradient(to top, rgba(5,5,5,0.86) 0%, rgba(5,5,5,0.25) 45%, rgba(5,5,5,0.1) 100%), url(${bannerUrl})`,
                  backgroundPosition: banner?.position ?? (banner?.fit === 'contain' ? 'right 24px center' : 'center'),
                } : undefined}
              >
                <span className="pf-brand-card-name">{brand.name}</span>
                <span className="pf-brand-card-count">
                  {new Intl.NumberFormat(locale).format(brand.count_with_image)} {text.products}
                </span>
                <span className="pf-brand-card-action">{text.action} <span aria-hidden="true">→</span></span>
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  return <>{children({ brand: selectedBrand, canChangeBrand: brands.length > 1, requestBrandSelection })}</>;
};
