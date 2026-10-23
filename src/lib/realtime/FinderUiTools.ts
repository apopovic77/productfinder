/**
 * Reine UI-Werkzeuge des Sprachberaters (Stufe 2, Post #5634, AiApi
 * b9f3ed3): der Browser fuehrt sie selbst aus und schickt das Ergebnis als
 * function_call_output zurueck. Sie gehen nie an /realtime/tool (AiApi
 * antwortet dort 400 client_tool). Argumente sind Enums oder fehlen; das
 * Modell liefert keine Produkt-IDs. Ergebnis nur bei echtem Erfolg ok.
 */
export const FINDER_UI_TOOLS = ['set_grouping', 'toggle_favorite', 'open_my_selection', 'show_outfit_image'] as const;
export type FinderUiToolName = typeof FINDER_UI_TOOLS[number];

const TOOL_SET: ReadonlySet<string> = new Set(FINDER_UI_TOOLS);

/** Werkzeug-Enum -> Gruppier-Dimension des Finders. */
export const GROUPING_DIMENSIONS: Readonly<Record<string, string>> = Object.freeze({
  product_type: 'product_type',
  product_line: 'product_line',
  color: 'color_base',
  price: 'price',
  model_year: 'model_year',
  availability: 'availability',
  size: 'size',
});

export type FinderUiToolResult = Readonly<Record<string, string | number | boolean | undefined>>;

export interface FinderUiToolPort {
  setGrouping(dimension: string): FinderUiToolResult;
  toggleFavorite(): FinderUiToolResult | Promise<FinderUiToolResult>;
  openMySelection(): FinderUiToolResult;
  showOutfitImage(): FinderUiToolResult;
}

export function isFinderUiTool(name: string): name is FinderUiToolName {
  return TOOL_SET.has(name);
}

export async function runFinderUiTool(
  port: FinderUiToolPort | null,
  name: FinderUiToolName,
  args: Readonly<Record<string, unknown>>,
): Promise<FinderUiToolResult> {
  if (!port) return { error: 'finder_nicht_bereit' };
  switch (name) {
    case 'set_grouping': {
      const dimension = typeof args.dimension === 'string' ? GROUPING_DIMENSIONS[args.dimension] : undefined;
      if (!dimension) return { error: 'dimension_nicht_verfuegbar' };
      return port.setGrouping(dimension);
    }
    case 'toggle_favorite':
      return port.toggleFavorite();
    case 'open_my_selection':
      return port.openMySelection();
    case 'show_outfit_image':
      return port.showOutfitImage();
  }
}
