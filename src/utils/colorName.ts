/**
 * Farbnamen der Kataloge ("black/neon yellow", "white/neon") nennen zuerst
 * meist die Grundierung, die eigentliche Farbe steht dahinter. Fuer Gruppen
 * und Farbkacheln zaehlt die erste bunte Teilfarbe (owner 2026-10-22).
 */
const NEUTRAL = /black|schwarz|white|wei(ß|ss)|gr[ae]y|grau|charcoal|anthracite|silver/;

/** Teilfarben eines Namens, klein geschrieben, ohne Leerteile. */
export function colorParts(colorName: string | null | undefined): string[] {
  return String(colorName ?? '').toLowerCase().split('/').map(part => part.trim()).filter(Boolean);
}

/** Erste bunte Teilfarbe; besteht der Name nur aus neutralen, die erste. */
export function accentColor(colorName: string | null | undefined): string {
  const parts = colorParts(colorName);
  return parts.find(part => !NEUTRAL.test(part)) ?? parts[0] ?? '';
}

export function isNeutralColor(part: string): boolean {
  return NEUTRAL.test(part);
}
