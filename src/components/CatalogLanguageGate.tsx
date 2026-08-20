import React, { useEffect, useState } from 'react';
import { CATALOG_ENTRY_CONFIG, type CatalogLocale } from '../config/CatalogEntryConfig';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { fetchFacets, type ContentLanguageFacet } from '../data/ProductRepository';
import { readCatalogQuery, writeCatalogUrl } from '../utils/catalogEntryUrl';
import './CatalogEntry.css';

type Props = {
  children: (context: { locale: CatalogLocale; requestLanding: () => void }) => React.ReactNode;
};

const uiText = {
  de: { language: 'Sprache wählen', retry: 'Erneut versuchen', loading: 'Sprachen werden geladen…' },
  en: { language: 'Choose your language', retry: 'Try again', loading: 'Loading languages…' },
};

function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export const CatalogLanguageGate: React.FC<Props> = ({ children }) => {
  const [languages, setLanguages] = useState<ContentLanguageFacet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [, setLocationVersion] = useState(0);

  useEffect(() => {
    const onLocationChange = () => setLocationVersion(version => version + 1);
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('cataloglocationchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('cataloglocationchange', onLocationChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchFacets()
      .then(facets => {
        if (!cancelled) setLanguages(facets.content_languages ?? []);
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load languages.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const requestedLocale = readCatalogQuery(window.location.href).lang;
  const selectedLanguage = languages.find(language => language.locale === requestedLocale && language.available);

  useEffect(() => {
    if (!isLoading && requestedLocale && !selectedLanguage) {
      writeCatalogUrl({ lang: null, brand: null, sport: null, category: null }, 'replace');
    }
  }, [isLoading, requestedLocale, selectedLanguage]);

  if (isLoading) {
    return <main className="pf-catalog-entry pf-catalog-entry-state"><p>{uiText.en.loading}</p></main>;
  }

  if (error) {
    return (
      <main className="pf-catalog-entry pf-catalog-entry-state" role="alert">
        <div><p>{error}</p><button type="button" onClick={() => setReloadKey(key => key + 1)}>{uiText.en.retry}</button></div>
      </main>
    );
  }

  if (selectedLanguage) {
    return <>{children({
      locale: selectedLanguage.locale,
      requestLanding: () => writeCatalogUrl({ lang: null, brand: null, sport: null, category: null }),
    })}</>;
  }

  const landingMedia = CATALOG_ENTRY_CONFIG.landing;
  const mediaFormat = landingMedia.mode === 'video' ? 'mp4' : landingMedia.mode === 'logo' ? 'png' : 'webp';
  const mediaUrl = landingMedia.url ?? (landingMedia.storageId
    ? `${STORAGE_API_BASE}/storage/media/${landingMedia.storageId}?format=${mediaFormat}`
    : null);

  return (
    <main className="pf-catalog-entry pf-catalog-landing">
      {landingMedia.mode === 'image' && mediaUrl && (
        <img className="pf-catalog-landing-media" src={mediaUrl} alt="" style={{ objectPosition: landingMedia.position ?? 'center' }} />
      )}
      {landingMedia.mode === 'video' && mediaUrl && (
        <video className="pf-catalog-landing-media" src={mediaUrl} autoPlay loop muted playsInline />
      )}
      <div className="pf-catalog-landing-shade" />
      <div className="pf-catalog-landing-content">
        <div className="pf-catalog-wordmark" aria-label="Gravity Sports Group">
          Gravity
          <span>Sports Group</span>
        </div>
        <div className="pf-catalog-landing-copy">
          <h1>Catalog {CATALOG_ENTRY_CONFIG.year}</h1>
        </div>
        <section className="pf-catalog-language-panel" aria-labelledby="catalog-language-title">
          <h2 id="catalog-language-title" className="pf-catalog-language-title">{uiText.en.language}</h2>
          <div className="pf-catalog-language-list">
            {languages.map(language => (
              <button
                type="button"
                className="pf-catalog-language"
                key={language.locale}
                disabled={!language.available}
                onClick={() => writeCatalogUrl({ lang: language.locale }, 'push')}
                title={`${Math.round(language.category_coverage * 100)}% categories · ${Math.round(language.product_coverage * 100)}% products`}
              >
                {languageName(language.locale)}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};
