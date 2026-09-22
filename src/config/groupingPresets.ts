/**
 * Gruppierungs-Reihenfolgen je Katalogknoten (owner 2026-08-23, aus dem
 * Pivot-Baum-Audit). Eigene Datei, damit sowohl der Baum (oneal-taxonomy)
 * als auch die Einstiegs-Konfiguration sie lesen koennen, ohne einander zu
 * importieren.
 */
export const HELMETS = ['product_line', 'design_group', 'color_base', 'color_name']; // 3SRS > design > base colour > colour
export const GEAR = ['product_type', 'product_line', 'design_group', 'color_base', 'color_name']; // jersey/pants > ELEMENT > design > base colour > colour
export const LINE_FIRST = ['product_line', 'design_group', 'color_base', 'color_name']; // gloves, boots, goggles
export const PROTECTION = ['body_part', 'product_line', 'color_base', 'color_name']; // chest/knee > line > base colour > colour
export const TYPE_COLOUR = ['product_type', 'color_base', 'color_name'];            // jackets, accessories
export const RAIN = ['garment_type', 'design_group', 'color_base', 'color_name'];   // jacket/pants derived from the model name
