/**
 * GPANE — O'Neal Taxonomy
 *
 * Predefined navigation tree matching oneal.eu shop menu.
 * Each node defines which products belong to it via match functions
 * that read from Product.attributes.
 */

import type { Product } from '../types/Product';
import type { TaxonomyEntryMeta, TaxonomyNode } from './types';
import { GEAR, HELMETS, LINE_FIRST, PROTECTION, TYPE_COLOUR } from '../config/groupingPresets';
import { getProductValue } from './types';

// ============================================================================
// Helpers
// ============================================================================

function hasSport(product: Product, sport: string): boolean {
  const val = getProductValue(product, 'sport');
  if (typeof val === 'string') return val.includes(sport);
  return false;
}

function hasType(product: Product, type: string): boolean {
  return getProductValue(product, 'product_type') === type;
}

function hasBodyPart(product: Product, part: string): boolean {
  return getProductValue(product, 'body_part') === part;
}

function hasCategory(product: Product, ...cats: string[]): boolean {
  const cat = getProductValue(product, 'category_primary') as string | undefined;
  if (!cat) return false;
  return cats.some(c => cat.includes(c));
}

function isAdult(product: Product): boolean {
  return getProductValue(product, 'target_group') === 'Erwachsene';
}

function isYouth(product: Product): boolean {
  return getProductValue(product, 'target_group') === 'Jugendliche';
}

function isWomen(product: Product): boolean {
  const name = product.name?.toLowerCase() || '';
  return name.includes('women') || name.includes('lady') || name.includes('ladies')
    || name.includes('girl') || name.includes('wmn');
}

function isNotSpare(product: Product): boolean {
  const cat = getProductValue(product, 'category_primary') as string | undefined;
  return !cat?.startsWith('Z-');
}

function isSpare(product: Product): boolean {
  const cat = getProductValue(product, 'category_primary') as string | undefined;
  return !!cat?.startsWith('Z-Spare');
}

function isMerchandise(product: Product): boolean {
  const cat = getProductValue(product, 'category_primary') as string | undefined;
  return cat === 'Z-Merchandise' || cat === 'Merchandise-Displays';
}

/**
 * Was im Shop unter Merchandise steht: Merchandise selbst plus Freizeit-
 * und Casual-Ware. MTB und MX schliessen das aus, sonst haengen Kappen,
 * Hoodies und Neckwarmer in zwei Aesten, erscheinen aber unter MX in
 * keiner Unterkategorie (2026-09-22).
 */
function isLeisure(product: Product): boolean {
  return isMerchandise(product) || hasCategory(product, 'Casual Wear', 'Leisure');
}

function isMotorrad(product: Product): boolean {
  return hasCategory(product, 'Street', 'Adventure', 'Road', 'Leather');
}

// ============================================================================
// Protektor-Subkategorien (shared across sports)
// ============================================================================

function protektorChildren(sportFilter: (p: Product) => boolean): TaxonomyNode[] {
  return [
    {
      label: 'Oberkörper',
      slug: 'oberkoerper',
      match: p => sportFilter(p) && hasType(p, 'Protektor') && hasBodyPart(p, 'Oberkörper'),
    },
    {
      label: 'Knie',
      slug: 'knie',
      match: p => sportFilter(p) && hasType(p, 'Protektor') && hasBodyPart(p, 'Beine'),
    },
    {
      label: 'Ellenbogen',
      slug: 'ellenbogen',
      match: p => sportFilter(p) && hasType(p, 'Protektor') && hasBodyPart(p, 'Arme'),
    },
    {
      label: 'Nackenschutz',
      slug: 'nacken',
      match: p => sportFilter(p) && hasType(p, 'Protektor') && hasBodyPart(p, 'Kopf'),
    },
    {
      label: 'Weitere',
      slug: 'weitere',
      match: p => sportFilter(p) && hasType(p, 'Protektor')
        && !hasBodyPart(p, 'Oberkörper') && !hasBodyPart(p, 'Beine')
        && !hasBodyPart(p, 'Arme') && !hasBodyPart(p, 'Kopf'),
    },
  ];
}

// ============================================================================
// O'Neal Taxonomy Tree
// ============================================================================

const TAXONOMY_TREE: TaxonomyNode[] = [
  // ---- MTB ----
  {
    label: 'MTB',
    slug: 'mtb',
    match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p) && !isLeisure(p),
    children: [
      {
        label: 'Helme',
        slug: 'helme',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p)
          && (hasType(p, 'Helm') || hasCategory(p, 'Helmets MTB', 'Helme MTB')),
        children: [
          {
            label: 'Full Face Helme',
            slug: 'full-face',
            match: p => hasSport(p, 'MTB') && isAdult(p) && hasCategory(p, 'Full Face'),
          },
          {
            label: 'Open Face Helme',
            slug: 'open-face',
            match: p => hasSport(p, 'MTB') && isAdult(p) && hasCategory(p, 'Open Face'),
          },
        ],
      },
      {
        label: 'Brillen',
        slug: 'brillen',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p) && hasType(p, 'Brille'),
      },
      {
        label: 'Kleidung',
        slug: 'kleidung',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p) && !isLeisure(p)
          && (hasType(p, 'Jersey') || hasType(p, 'Short') || hasType(p, 'Hose')
            || hasType(p, 'Jacke') || hasType(p, 'Regenbekleidung')
            || hasType(p, 'Handschuh') || hasType(p, 'Socke')
            || hasCategory(p, 'Jerseys', 'Pants', 'Shorts', 'Rain Wear', 'Gloves', 'Socks')),
        children: [
          { label: 'Jerseys', slug: 'jerseys', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Jersey') },
          { label: 'Shorts', slug: 'shorts', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Short') },
          { label: 'Hosen', slug: 'hosen', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Hose') },
          { label: 'Jacken', slug: 'jacken', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Jacke') },
          { label: 'Regenkleidung', slug: 'regen', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Regenbekleidung') },
          { label: 'Handschuhe', slug: 'handschuhe', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Handschuh') },
          { label: 'Socken', slug: 'socken', match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Socke') },
        ],
      },
      {
        label: 'Protektoren',
        slug: 'protektoren',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p)
          && (hasType(p, 'Protektor') || hasCategory(p, 'Protection')),
        children: protektorChildren(p => hasSport(p, 'MTB') && isAdult(p)),
      },
      {
        label: 'Schuhe',
        slug: 'schuhe',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p) && hasType(p, 'Schuh'),
      },
      {
        label: 'Accessories',
        slug: 'accessories',
        match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p)
          && (hasType(p, 'Accessoire') || hasType(p, 'Transport')),
      },
    ],
  },

  // ---- MX ----
  {
    label: 'MX',
    slug: 'mx',
    match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && !isLeisure(p) && !isMotorrad(p),
    children: [
      {
        label: 'Helme',
        slug: 'helme',
        // Ein Teil der Artikel hat keinen Produkttyp und einige keine
        // Kategorie gepflegt (LIUS) — deshalb reicht EINES von beiden, sonst
        // fehlt der Helm im Katalog, den der Shop zeigt (2026-09-22).
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && !isMotorrad(p)
          && (hasCategory(p, 'Helmets MX') || hasType(p, 'Helm')),
        children: [
          { label: 'Sport', slug: 'sport', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Helm') && hasCategory(p, 'Helmets MX') },
        ],
      },
      {
        label: 'Brillen',
        slug: 'brillen',
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && hasType(p, 'Brille'),
      },
      {
        label: 'Kleidung',
        slug: 'kleidung',
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && !isMotorrad(p) && !isLeisure(p)
          && (hasType(p, 'Jersey') || hasType(p, 'Hose') || hasType(p, 'Jacke')
            || hasType(p, 'Regenbekleidung') || hasType(p, 'Handschuh') || hasType(p, 'Socke')
            || hasCategory(p, 'Jerseys', 'Pants', 'Rain Wear', 'Gloves', 'Socks')),
        children: [
          { label: 'Jerseys', slug: 'jerseys', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Jersey') },
          { label: 'Hosen', slug: 'hosen', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Hose') },
          { label: 'Jacken', slug: 'jacken', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Jacke') },
          { label: 'Regenkleidung', slug: 'regen', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Regenbekleidung') },
          { label: 'Handschuhe', slug: 'handschuhe', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Handschuh') },
          { label: 'Socken', slug: 'socken', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Socke') },
        ],
      },
      {
        label: 'Protektoren',
        slug: 'protektoren',
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p)
          && (hasType(p, 'Protektor') || hasCategory(p, 'Protection')),
        children: protektorChildren(p => hasSport(p, 'MX') && isAdult(p)),
      },
      {
        label: 'Stiefel',
        slug: 'stiefel',
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && hasType(p, 'Stiefel') && !isMotorrad(p),
      },
      {
        label: 'Accessories',
        slug: 'accessories',
        match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p)
          && (hasType(p, 'Accessoire') || hasType(p, 'Transport') || hasType(p, 'Griff')),
      },
      {
        label: 'Ersatzteile',
        slug: 'ersatzteile',
        match: p => hasSport(p, 'MX') && isSpare(p),
      },
    ],
  },

  // ---- Motorrad ----
  {
    label: 'Motorrad',
    slug: 'motorrad',
    match: p => isMotorrad(p) && isAdult(p),
    children: [
      {
        label: 'Helme',
        slug: 'helme',
        match: p => isMotorrad(p) && isNotSpare(p)
          && (hasType(p, 'Helm') || hasCategory(p, 'Helmets Street', 'Helmets Adventure')),
        children: [
          { label: 'Adventure', slug: 'adventure', match: p => hasCategory(p, 'Adventure') },
          { label: 'Street', slug: 'street', match: p => hasCategory(p, 'Street') },
        ],
      },
      {
        label: 'Kleidung',
        slug: 'kleidung',
        match: p => isMotorrad(p) && isNotSpare(p)
          && (hasType(p, 'Jacke') || hasType(p, 'Hose') || hasType(p, 'Handschuh')),
      },
      {
        label: 'Stiefel',
        slug: 'stiefel',
        match: p => isMotorrad(p) && isNotSpare(p) && hasType(p, 'Stiefel'),
      },
      {
        label: 'Protektoren',
        slug: 'protektoren',
        match: p => isMotorrad(p) && isNotSpare(p) && hasType(p, 'Protektor'),
      },
      {
        label: 'Accessories',
        slug: 'accessories',
        match: p => isMotorrad(p) && (hasType(p, 'Accessoire') || hasType(p, 'Transport')),
      },
      {
        label: 'Ersatzteile',
        slug: 'ersatzteile',
        match: p => isMotorrad(p) && isSpare(p),
      },
    ],
  },

  // ---- Frauen ----
  {
    label: 'Frauen',
    slug: 'frauen',
    match: p => isWomen(p) && isNotSpare(p),
    children: [
      {
        label: 'Frauen MX',
        slug: 'frauen-mx',
        match: p => isWomen(p) && hasSport(p, 'MX'),
      },
      {
        label: 'Frauen MTB',
        slug: 'frauen-mtb',
        match: p => isWomen(p) && hasSport(p, 'MTB'),
      },
    ],
  },

  // ---- Kinder ----
  {
    label: 'Kinder',
    slug: 'kinder',
    match: p => isYouth(p) && isNotSpare(p),
    children: [
      {
        label: 'Kinder MTB',
        slug: 'kinder-mtb',
        match: p => isYouth(p) && hasSport(p, 'MTB'),
        children: [
          { label: 'Helme', slug: 'helme', match: p => isYouth(p) && hasSport(p, 'MTB') && hasType(p, 'Helm') },
          { label: 'Brillen', slug: 'brillen', match: p => isYouth(p) && hasSport(p, 'MTB') && hasType(p, 'Brille') },
          { label: 'Protektoren', slug: 'protektoren', match: p => isYouth(p) && hasSport(p, 'MTB') && hasType(p, 'Protektor') },
          { label: 'Jerseys', slug: 'jerseys', match: p => isYouth(p) && hasSport(p, 'MTB') && hasType(p, 'Jersey') },
          { label: 'Hosen', slug: 'hosen', match: p => isYouth(p) && hasSport(p, 'MTB') && (hasType(p, 'Hose') || hasType(p, 'Short')) },
          { label: 'Handschuhe', slug: 'handschuhe', match: p => isYouth(p) && hasSport(p, 'MTB') && hasType(p, 'Handschuh') },
        ],
      },
      {
        label: 'Kinder MX',
        slug: 'kinder-mx',
        match: p => isYouth(p) && hasSport(p, 'MX'),
        children: [
          { label: 'Helme', slug: 'helme', match: p => isYouth(p) && hasSport(p, 'MX') && hasType(p, 'Helm') },
          { label: 'Brillen', slug: 'brillen', match: p => isYouth(p) && hasSport(p, 'MX') && hasType(p, 'Brille') },
          { label: 'Kleidung', slug: 'kleidung', match: p => isYouth(p) && hasSport(p, 'MX') && (hasType(p, 'Jersey') || hasType(p, 'Hose')) },
          { label: 'Protektoren', slug: 'protektoren', match: p => isYouth(p) && hasSport(p, 'MX') && hasType(p, 'Protektor') },
          { label: 'Handschuhe', slug: 'handschuhe', match: p => isYouth(p) && hasSport(p, 'MX') && hasType(p, 'Handschuh') },
          { label: 'Stiefel', slug: 'stiefel', match: p => isYouth(p) && hasSport(p, 'MX') && hasType(p, 'Stiefel') },
        ],
      },
    ],
  },

  // ---- Merchandise ----
  {
    label: 'Merchandise',
    slug: 'merchandise',
    match: p => isLeisure(p),
  },
];

// ============================================================================
// Einstiegs-Metadaten (Banner, Gruppierung, Sprache)
// ============================================================================

/**
 * Der gefuehrte Einstieg und der volle Finder lesen denselben Baum
 * (owner 2026-09-22). Die Knoten selbst bleiben reine Navigation; was nur
 * die Banner-Stufen brauchen — Bild, Gruppierung, englische Beschriftung —
 * haengt hier am Pfad. Die Bild-Nummern sind die kuratierten Motive aus der
 * frueheren Kategorie-Konfiguration; Knoten ohne Motiv zeigen stattdessen
 * Produktbilder.
 */
const ENTRY_META: Record<string, TaxonomyEntryMeta> = {
  mtb: {
    labels: { en: 'MTB' },
    banner: { mode: 'image', storageId: 15344 },
    bannersByBrand: {
      "O'Neal": { mode: 'image', storageId: 15344 },
      'Kini Red Bull': { mode: 'image', storageId: 31537, position: 'center 42%' },
      'ONE Industries': { mode: 'image', storageId: 31802, position: 'center 44%' },
    },
  },
  'mtb/helme': { labels: { en: 'Helmets' }, grouping: HELMETS, banner: { mode: 'image', storageId: 15962 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 31461, position: 'center 40%' } } },
  'mtb/brillen': { labels: { en: 'Goggles' }, grouping: LINE_FIRST, banner: { mode: 'image', storageId: 14971 } },
  'mtb/kleidung': { labels: { en: 'Apparel' }, grouping: GEAR, banner: { mode: 'image', storageId: 17053 } },
  'mtb/protektoren': { labels: { en: 'Protectors' }, grouping: PROTECTION, banner: { mode: 'image', storageId: 15316 } },
  'mtb/schuhe': { labels: { en: 'Shoes' }, grouping: LINE_FIRST, banner: { mode: 'image', storageId: 15811 } },
  'mtb/accessories': { labels: { en: 'Accessories' }, grouping: TYPE_COLOUR, banner: { mode: 'image', storageId: 15480 } },

  mx: {
    labels: { en: 'MX' },
    banner: { mode: 'image', storageId: 17577 },
    bannersByBrand: {
      "O'Neal": { mode: 'image', storageId: 17577 },
      'Kini Red Bull': { mode: 'image', storageId: 30976, position: 'center 45%' },
      'ONE Industries': { mode: 'image', storageId: 31795, position: 'center 42%' },
    },
  },
  'mx/helme': { labels: { en: 'Helmets' }, grouping: HELMETS, banner: { mode: 'image', storageId: 10435 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 30827, position: 'center 42%' }, 'ONE Industries': { mode: 'image', storageId: 31910, position: 'center 30%' } } },
  'mx/brillen': { labels: { en: 'Goggles' }, grouping: LINE_FIRST, banner: { mode: 'image', storageId: 9970 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 31474, position: 'center 45%' } } },
  'mx/kleidung': { labels: { en: 'Apparel' }, grouping: GEAR, banner: { mode: 'image', storageId: 17772 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 31136, position: 'center 62%' }, 'ONE Industries': { mode: 'image', storageId: 31968, position: 'center' } } },
  'mx/protektoren': { labels: { en: 'Protectors' }, grouping: PROTECTION, banner: { mode: 'image', storageId: 10916 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 31318, position: 'center 45%' } } },
  'mx/stiefel': { labels: { en: 'Boots' }, grouping: LINE_FIRST, banner: { mode: 'image', storageId: 11767 } },
  'mx/accessories': { labels: { en: 'Accessories' }, grouping: TYPE_COLOUR, banner: { mode: 'image', storageId: 15480 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 30538, position: 'center 30%' } } },
  'mx/ersatzteile': { labels: { en: 'Spare Parts' }, grouping: TYPE_COLOUR },

  motorrad: { labels: { en: 'Street' }, banner: { mode: 'image', storageId: 18556 } },
  'motorrad/helme': { labels: { en: 'Helmets' }, grouping: HELMETS, banner: { mode: 'image', storageId: 18556 }, bannersByBrand: { 'Kini Red Bull': { mode: 'image', storageId: 30609, position: 'center 50%' } } },
  'motorrad/kleidung': { labels: { en: 'Apparel' }, grouping: GEAR, banner: { mode: 'image', storageId: 18695 } },
  'motorrad/stiefel': { labels: { en: 'Boots' }, grouping: LINE_FIRST },
  'motorrad/protektoren': { labels: { en: 'Protectors' }, grouping: PROTECTION },
  'motorrad/accessories': { labels: { en: 'Accessories' }, grouping: TYPE_COLOUR },
  'motorrad/ersatzteile': { labels: { en: 'Spare Parts' }, grouping: TYPE_COLOUR },

  frauen: { labels: { en: 'Women' } },
  'frauen/frauen-mx': { labels: { en: 'Women MX' }, grouping: GEAR },
  'frauen/frauen-mtb': { labels: { en: 'Women MTB' }, grouping: GEAR },

  kinder: { labels: { en: 'Kids' }, banner: { mode: 'image', storageId: 17684 } },
  'kinder/kinder-mx': { labels: { en: 'Kids MX' }, grouping: GEAR, banner: { mode: 'image', storageId: 17967 } },
  'kinder/kinder-mtb': { labels: { en: 'Kids MTB' }, grouping: GEAR, banner: { mode: 'image', storageId: 14432 } },

  merchandise: { labels: { en: 'Merchandise' }, grouping: TYPE_COLOUR, banner: { mode: 'image', storageId: 15480 } },
};

function withEntryMeta(nodes: TaxonomyNode[], prefix = ''): TaxonomyNode[] {
  return nodes.map(node => {
    const path = prefix ? `${prefix}/${node.slug}` : node.slug;
    return {
      ...node,
      entry: ENTRY_META[path],
      children: node.children ? withEntryMeta(node.children, path) : undefined,
    };
  });
}

export const ONEAL_TAXONOMY: TaxonomyNode[] = withEntryMeta(TAXONOMY_TREE);

/** Knoten ueber seinen Pfad finden ("mx", "mx/helme"). */
export function findTaxonomyNode(path: readonly string[]): TaxonomyNode | undefined {
  let nodes: TaxonomyNode[] | undefined = ONEAL_TAXONOMY;
  let found: TaxonomyNode | undefined;
  for (const slug of path) {
    found = nodes?.find(node => node.slug === slug);
    if (!found) return undefined;
    nodes = found.children;
  }
  return found;
}
