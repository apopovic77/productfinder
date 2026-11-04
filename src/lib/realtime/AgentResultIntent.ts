/**
 * Konfigurator oder Auswahl? (owner 2026-11-04): Der Sprachberater sagt mit
 * dem Argument `presentation` an find_products / refine_search, ob er ein
 * Outfit zusammenstellt ("outfit": Figur mit Alternativen) oder Produkte
 * zeigt/filtert ("selection": normale Gruppen-/Pivot-Sicht). Das Argument
 * kennt nur der Finder; vor dem Weiterreichen an den BFF (extra=forbid)
 * wird es entfernt. Ohne Angabe gilt das bisherige Verhalten (Figur ab drei
 * Koerperbereichen).
 */
export type AgentResultIntent = 'outfit' | 'selection';

let current: AgentResultIntent | null = null;

/** Liest und entfernt `presentation`; liefert die Argumente fuer den BFF. */
export function takeAgentPresentation(name: string, args: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  if (name !== 'find_products' && name !== 'refine_search') return args;
  if (!('presentation' in args)) {
    // Neue Suche ohne Angabe: bisheriges Verhalten; Verfeinern behaelt die Sicht
    if (name === 'find_products') current = null;
    return args;
  }
  const { presentation, ...rest } = args as Record<string, unknown>;
  current = presentation === 'outfit' ? 'outfit' : presentation === 'selection' ? 'selection' : null;
  return rest;
}

export function agentResultIntent(): AgentResultIntent | null {
  return current;
}
