/**
 * Geometrie des aufgeklappten Detaildialogs (Desktop): rechte
 * Bildschirmhaelfte, volle Hoehe ueber der Kopfleiste (owner 2026-10-20,
 * media 131623/131625/131626). Eine Stelle fuer Dialog, Bildspalte und das
 * Stimmungsbild links daneben, damit alle drei aus denselben Zahlen
 * entstehen und gleichzeitig an ihrem Platz sind, statt nachzumessen.
 */
export type ExpandedDialogGeometry = {
  /** Breite des Dialogs; links davon liegt die freie Flaeche. */
  width: number;
  height: number;
  /** Breite der Bildspalte im Dialog */
  stageWidth: number;
};

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
  // Unter 1520 px reicht die Haelfte nicht fuer Bildspalte und Text.
  const width = Math.min(viewportWidth, Math.max(760, Math.round(viewportWidth / 2)));
  return { width, height: viewportHeight, stageWidth: Math.min(492, Math.round(width * 0.46)) };
}
