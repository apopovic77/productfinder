/**
 * Geometrie des aufgeklappten Detaildialogs (Desktop): rechte
 * Bildschirmhaelfte, volle Hoehe ueber der Kopfleiste (owner 2026-10-20,
 * media 131623/131625/131626). Eine Stelle fuer Dialog, Bildspalte und das
 * Stimmungsbild links daneben, damit alle drei aus denselben Zahlen
 * entstehen und gleichzeitig an ihrem Platz sind, statt nachzumessen.
 */
export type ExpandedDialogGeometry = {
  width: number;
  height: number;
  /** Abstand zum linken/rechten bzw. oberen/unteren Bildschirmrand */
  marginX: number;
  marginY: number;
  /** Breite der Bildspalte im Dialog */
  stageWidth: number;
};

/** Rand des aufgeklappten Dialogs auf jeder Seite (Desktop). */
const EXPANDED_MARGIN = 150;

/** Dauer und Kurve der Dialog-Animation, auch fuer den Hintergrund. */
export const DIALOG_MORPH_SECONDS = 0.45;
export const DIALOG_MORPH_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Am Handy liegt der Dialog als Sheet ueber allem, ohne Haelfte. */
export function usesHalfScreenDialog(width = window.innerWidth, height = window.innerHeight): boolean {
  return !(width <= 768 && height > width);
}

export function expandedDialogGeometry(
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): ExpandedDialogGeometry {
  // Gross und zentriert, 150 px Rand auf jeder Seite, ohne Stimmungsbild
  // daneben (owner 2026-10-21). Auf kleinen Bildschirmen schrumpft der Rand,
  // damit Bildspalte und Text Platz behalten.
  // Breite: 75 % der Flaeche zwischen den 150-px-Raendern, mindestens 760 px;
  // ganz breit verlor sich der Inhalt (owner 2026-10-21).
  const baseMarginX = Math.max(16, Math.min(EXPANDED_MARGIN, Math.floor((viewportWidth - 760) / 2)));
  const width = Math.min(viewportWidth - baseMarginX * 2, Math.max(760, Math.round((viewportWidth - baseMarginX * 2) * 0.75)));
  const marginX = Math.round((viewportWidth - width) / 2);
  const marginY = Math.max(16, Math.min(EXPANDED_MARGIN, Math.floor((viewportHeight - 480) / 2)));
  // Unten buendig am Bildschirmrand, Rand nur oben (owner 2026-10-21)
  const height = viewportHeight - marginY;
  return { width, height, marginX, marginY, stageWidth: Math.min(760, Math.round(width * 0.46)) };
}
