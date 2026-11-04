import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';
import type { Product } from '../types/Product';

/**
 * "Passt dazu" in der Produktkarte (owner 2026-11-04, EICMA-Befund, Post #5768):
 * Empfehlungen je Produkt aus dem Prolog-Regelwerk in oneal-api-v2
 * (OnealServ-Codex, Issue #2643). Vertrag:
 *   GET /v1/recommendations?product_id=…&lang=de|en&limit=…
 *   -> {groups:[{group_id,title,items:[{id,rule_id,reason,score}]}]}
 * Gruppen: alternatives | same_design | color_match | complementary_equipment.
 * Fehler oder fehlender Endpunkt -> keine Gruppen, der Abschnitt bleibt weg.
 */
export type RecommendationItem = { id: string; rule_id: string; reason: string; score: number };
export type RecommendationGroup = { group_id: string; title: string; items: RecommendationItem[] };

const cache = new Map<string, Promise<RecommendationGroup[]>>();

function parse(data: unknown): RecommendationGroup[] {
  const groups = (data as { groups?: unknown })?.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((g: any) => {
    if (!g || typeof g.group_id !== 'string' || !Array.isArray(g.items)) return [];
    const items = g.items
      .filter((it: any) => it && it.id != null)
      .map((it: any) => ({ id: String(it.id), rule_id: String(it.rule_id ?? ''), reason: String(it.reason ?? ''), score: Number(it.score) || 0 }));
    return items.length ? [{ group_id: g.group_id, title: String(g.title ?? g.group_id), items }] : [];
  });
}

/**
 * Testdaten, solange der Endpunkt fehlt (?recs=mock): gleiche Sportart und
 * Grundfarbe, andere Produktart. Nur fuer die Darstellung, keine Fachlogik.
 */
function mockGroups(anchor: Product, all: Product[], lang: string): RecommendationGroup[] {
  const attr = (p: Product, k: string) => {
    const a = (p as any).attributes?.[k];
    const v = a?.valueObject?.raw ?? a?.value ?? (p as any).raw?.properties?.[k];
    return Array.isArray(v) ? v.map(String) : v != null ? [String(v)] : [];
  };
  const sport = new Set(attr(anchor, 'sport'));
  const type = attr(anchor, 'product_type')[0];
  const color = attr(anchor, 'color_base')[0];
  const pool = all.filter(p => p.id !== anchor.id && attr(p, 'sport').some(s => sport.has(s)));
  const pick = (f: (p: Product) => boolean, n: number) => {
    const seen = new Set<string>();
    return pool.filter(f).filter(p => { const t = attr(p, 'product_type')[0] ?? ''; if (seen.has(t)) return false; seen.add(t); return true; }).slice(0, n);
  };
  const en = lang === 'en';
  const groups: RecommendationGroup[] = [
    { group_id: 'alternatives', title: en ? 'Alternatives' : 'Alternativen', items: pool.filter(p => attr(p, 'product_type')[0] === type).slice(0, 4).map(p => ({ id: String(p.id), rule_id: 'mock', reason: en ? 'Test data' : 'Testdaten', score: 0 })) },
    { group_id: 'color_match', title: en ? 'Matching colours' : 'Farblich passend', items: pick(p => attr(p, 'product_type')[0] !== type && attr(p, 'color_base')[0] === color, 5).map(p => ({ id: String(p.id), rule_id: 'mock', reason: en ? 'Test data' : 'Testdaten', score: 0 })) },
  ];
  return groups.filter(g => g.items.length > 0);
}

export class RecommendationService {
  /** Beim Laden gelesen: der Finder schreibt die URL spaeter um. */
  private static readonly MOCK = (() => {
    // ?recs=mock geht beim Einstieg verloren (Weiterleitung auf flow=direct),
    // deshalb merkt sich der Browser den Schalter: localStorage pf.recs=mock
    try {
      if (new URLSearchParams(window.location.search).get('recs') === 'mock') localStorage.setItem('pf.recs', 'mock');
      return localStorage.getItem('pf.recs') === 'mock';
    } catch { return false; }
  })();

  static mockMode(): boolean {
    return RecommendationService.MOCK;
  }

  static load(anchor: Product, lang: string, all: Product[], limit = 16): Promise<RecommendationGroup[]> {
    const key = `${anchor.id}|${lang}|${limit}`;
    if (!cache.has(key)) {
      const request = RecommendationService.mockMode()
        ? Promise.resolve(mockGroups(anchor, all, lang))
        : fetch(`${ONEAL_API_BASE}/recommendations?product_id=${encodeURIComponent(String(anchor.id))}&lang=${encodeURIComponent(lang)}&limit=${limit}`, {
            headers: { 'X-API-Key': ONEAL_API_KEY },
          })
            .then(r => (r.ok ? r.json() : null))
            .then(parse)
            .catch(() => []);
      // Fehlschlag nicht dauerhaft merken: beim naechsten Oeffnen neu fragen
      request.then(groups => { if (!groups.length) cache.delete(key); });
      cache.set(key, request);
    }
    return cache.get(key)!;
  }
}
