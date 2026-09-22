import { resolveCatalogFlow } from '../config/CatalogEntryConfig';

/**
 * Vollmodus (owner 2026-09-22): Der Finder startet geführt (Marke → Sport →
 * Kategorie → Serie), oben rechts bleibt aber immer der Sprung in den
 * vollen Finder mit allen Produkten — und von dort zurück in die Führung.
 * Die Flow-Variante wird beim Boot gelesen (main.tsx), deshalb ist der
 * Wechsel ein Seitenaufruf mit anderem ?flow; die Sprache bleibt erhalten.
 */
export function isFullFinderMode(): boolean {
  return resolveCatalogFlow().gates.length === 0;
}

export function fullModeHref(full: boolean): string {
  const current = new URL(window.location.href);
  const next = new URL(current.pathname, current.origin);
  const lang = current.searchParams.get('lang');
  if (lang) next.searchParams.set('lang', lang);
  if (full) next.searchParams.set('flow', 'direct');
  return `${next.pathname}${next.search}`;
}

const LABELS: Record<string, { full: string; guided: string }> = {
  de: { full: 'Alle Produkte', guided: 'Geführte Auswahl' },
  en: { full: 'All products', guided: 'Guided selection' },
  fr: { full: 'Tous les produits', guided: 'Sélection guidée' },
  it: { full: 'Tutti i prodotti', guided: 'Selezione guidata' },
  es: { full: 'Todos los productos', guided: 'Selección guiada' },
};

export function fullModeLabel(full: boolean): string {
  const lang = new URL(window.location.href).searchParams.get('lang') ?? 'de';
  const text = LABELS[lang] ?? LABELS.en;
  return full ? text.full : text.guided;
}

export function FullModeIcon({ full }: { full: boolean }) {
  return full ? (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ) : (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M7 12h10M10 18h4"/>
    </svg>
  );
}

/** Schwebender Schalter für die Gate-Seiten; im Finder sitzt er im Header. */
export function FullModeToggle({ className = '' }: { className?: string }) {
  const targetFull = !isFullFinderMode();
  return (
    <a className={`pf-full-mode-floating ${className}`} href={fullModeHref(targetFull)}>
      <FullModeIcon full={targetFull} />
      <span>{fullModeLabel(targetFull)}</span>
    </a>
  );
}
