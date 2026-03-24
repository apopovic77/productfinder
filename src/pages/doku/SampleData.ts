/**
 * GPANE Doku — O'Neal Config
 *
 * Uses the same ProductRepository as the ProductFinder.
 * No fake data — real API, real products.
 */

import type { GPANEConfig } from '../../gpane';
import { DEFAULT_CONFIG, ONEAL_TAXONOMY } from '../../gpane';

/**
 * O'Neal-specific GPANE config with taxonomy.
 */
export const ONEAL_CONFIG: GPANEConfig = {
  ...DEFAULT_CONFIG,
  domain: 'oneal',
  taxonomy: ONEAL_TAXONOMY,
  overrides: {
    variant_colors: { hidden: true },
    variant_sizes: { hidden: true },
    has_image: { hidden: true },
    product_code: { hidden: true },
    family_name: { hidden: true },
    is_spare: { label: 'Ersatzteil' },
    model_year: { label: 'Jahrgang', dataType: 'numeric_discrete' },
  },
  hierarchies: [
    {
      name: 'Product Hierarchy',
      levels: ['presentation_category', 'product_line', 'design_group'],
      bonusPerLevel: 0.3,
      strictOrder: false,
    },
  ],
};

/**
 * Same config but WITHOUT taxonomy — pure GPANE auto mode for comparison.
 */
export const ONEAL_CONFIG_AUTO: GPANEConfig = {
  ...ONEAL_CONFIG,
  taxonomy: undefined,
};
