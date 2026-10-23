/**
 * Icons der Gruppier-Dimensionen und ihrer Werte (owner 2026-10-23, Post
 * #5627, gezeichnet von OnealProductKatalog). Dateien unter
 * src/assets/facet-icons/<key>.svg. Fehlt ein Wert, gilt das Icon der
 * Dimension; Marke, Preis, Jahrgang u. a. Zahlen haben bewusst kein Wert-Icon.
 */
export const DIMENSION_ICONS: Record<string, string> = {
  __taxonomy__: 'dim_category',
  presentation_category: 'dim_category',
  category_primary: 'dim_category',
  product_type: 'dim_type',
  garment_type: 'dim_type',
  price: 'dim_price',
  body_part: 'dim_body_part',
  size_type: 'dim_size_type',
  product_function: 'dim_function',
  brand: 'dim_brand',
  sport: 'dim_sport',
  model_year: 'dim_model_year',
  target_group: 'dim_target_group',
  availability: 'dim_availability',
};

const TYPE_VALUES: Record<string, string> = {
  helm: 'type_helmet', helme: 'type_helmet',
  jersey: 'type_jersey', jerseys: 'type_jersey',
  brille: 'type_goggles', brillen: 'type_goggles',
  hose: 'type_pants', hosen: 'type_pants',
  handschuh: 'type_gloves', handschuhe: 'type_gloves',
  stiefel: 'type_boots', schuh: 'type_boots',
  protektor: 'type_protector', protektoren: 'type_protector',
  socke: 'type_socks', socken: 'type_socks',
  jacke: 'type_jacket', jacken: 'type_jacket',
  regenbekleidung: 'type_rain',
  freizeit: 'type_casual', kleidung: 'type_jersey',
  short: 'type_shorts', shorts: 'type_shorts',
  accessoire: 'function_accessory', accessoires: 'function_accessory',
  taschen: 'cat_bags', rucksack: 'cat_bags', tasche: 'cat_bags',
};

/** Werte je Dimension, Schluessel klein geschrieben. */
const VALUE_ICONS: Record<string, Record<string, string>> = {
  sport: { mx: 'sport_mx', mtb: 'sport_mtb', moto: 'sport_mx' },
  target_group: { erwachsene: 'target_adults', jugendliche: 'target_youth', kinder: 'target_youth' },
  product_function: {
    schutz: 'function_protection', bekleidung: 'function_apparel',
    sicht: 'function_vision', accessoire: 'function_accessory',
  },
  body_part: {
    kopf: 'body_head', 'oberkörper': 'body_upper', arme: 'body_arms',
    'hände': 'body_hands', beine: 'body_legs', 'füße': 'body_feet',
  },
  product_type: TYPE_VALUES,
  presentation_category: TYPE_VALUES,
  garment_type: TYPE_VALUES,
  __taxonomy__: {
    ...TYPE_VALUES, frauen: 'target_adults', kinder: 'target_youth', mx: 'sport_mx', mtb: 'sport_mtb',
    // Unterkategorien der Taxonomie (Protektoren)
    'oberkörper': 'body_upper', 'knie & beine': 'body_legs', ellenbogen: 'body_arms',
    accessories: 'function_accessory', 'street / adventure': 'cat_street_helmet',
  },
  category_primary: {
    'helmets mx': 'type_helmet', 'helmets street': 'cat_street_helmet', goggles: 'type_goggles',
    'jerseys offroad': 'type_jersey', 'jerseys mtb': 'type_jersey',
    'pants mx': 'type_pants', 'pants/ shorts mtb': 'type_pants',
    gloves: 'type_gloves', 'protection mx': 'type_protector', 'protection mtb': 'type_protector',
    'boots mx': 'type_boots', 'boots adventure': 'cat_adventure_boots',
    'rain wear': 'type_rain', jackets: 'type_jacket',
    'leisure accessories': 'type_casual', 'casual wear': 'type_casual', 'bags / backpacks': 'cat_bags',
  },
  size_type: {
    clothing: 'size_clothing', 'konfektionsgrößen': 'size_clothing',
    pants: 'size_pants', 'hosengrößen': 'size_pants',
    boot: 'size_shoe', shoe: 'size_shoe', sock: 'size_shoe', 'schuhgrößen': 'size_shoe', 'sockengrößen': 'size_shoe',
    helmet: 'size_helmet', 'helmgrößen': 'size_helmet',
    other: 'size_other',
  },
  availability: {
    'alle größen lieferbar': 'stock_in', 'teilweise lieferbar': 'stock_partial', 'nicht lieferbar': 'stock_out',
  },
};

export function dimensionIconKey(dimension: string): string | null {
  return DIMENSION_ICONS[dimension] ?? null;
}

/** Icon fuer einen Gruppenwert; sonst das der Dimension; sonst keins. */
export function valueIconKey(dimension: string, value: string): string | null {
  const v = String(value || '').trim().toLowerCase();
  return VALUE_ICONS[dimension]?.[v] ?? dimensionIconKey(dimension);
}
