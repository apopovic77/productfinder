/**
 * GPANE — O'Neal Taxonomy
 *
 * Predefined navigation tree matching oneal.eu shop menu.
 * Each node defines which products belong to it via match functions
 * that read from Product.attributes.
 */

import type { Product } from '../types/Product';
import type { TaxonomyNode } from './types';
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

export const ONEAL_TAXONOMY: TaxonomyNode[] = [
  // ---- MTB ----
  {
    label: 'MTB',
    slug: 'mtb',
    match: p => hasSport(p, 'MTB') && isAdult(p) && isNotSpare(p) && !isMerchandise(p),
    children: [
      {
        label: 'Helme',
        slug: 'helme',
        match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Helm'),
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
        match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Brille'),
      },
      {
        label: 'Kleidung',
        slug: 'kleidung',
        match: p => hasSport(p, 'MTB') && isAdult(p)
          && (hasType(p, 'Jersey') || hasType(p, 'Short') || hasType(p, 'Hose')
            || hasType(p, 'Jacke') || hasType(p, 'Regenbekleidung')
            || hasType(p, 'Handschuh') || hasType(p, 'Socke')),
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
        match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Protektor'),
        children: protektorChildren(p => hasSport(p, 'MTB') && isAdult(p)),
      },
      {
        label: 'Schuhe',
        slug: 'schuhe',
        match: p => hasSport(p, 'MTB') && isAdult(p) && hasType(p, 'Schuh'),
      },
      {
        label: 'Accessories',
        slug: 'accessories',
        match: p => hasSport(p, 'MTB') && isAdult(p)
          && (hasType(p, 'Accessoire') || hasType(p, 'Transport')),
      },
    ],
  },

  // ---- MX ----
  {
    label: 'MX',
    slug: 'mx',
    match: p => hasSport(p, 'MX') && isAdult(p) && isNotSpare(p) && !isMerchandise(p) && !isMotorrad(p),
    children: [
      {
        label: 'Helme',
        slug: 'helme',
        match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Helm') && hasCategory(p, 'Helmets MX'),
        children: [
          { label: 'Sport', slug: 'sport', match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Helm') && hasCategory(p, 'Helmets MX') },
        ],
      },
      {
        label: 'Brillen',
        slug: 'brillen',
        match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Brille'),
      },
      {
        label: 'Kleidung',
        slug: 'kleidung',
        match: p => hasSport(p, 'MX') && isAdult(p) && !isMotorrad(p)
          && (hasType(p, 'Jersey') || hasType(p, 'Hose') || hasType(p, 'Jacke')
            || hasType(p, 'Regenbekleidung') || hasType(p, 'Handschuh') || hasType(p, 'Socke')),
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
        match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Protektor'),
        children: protektorChildren(p => hasSport(p, 'MX') && isAdult(p)),
      },
      {
        label: 'Stiefel',
        slug: 'stiefel',
        match: p => hasSport(p, 'MX') && isAdult(p) && hasType(p, 'Stiefel') && !isMotorrad(p),
      },
      {
        label: 'Accessories',
        slug: 'accessories',
        match: p => hasSport(p, 'MX') && isAdult(p)
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
        match: p => isMotorrad(p) && hasType(p, 'Helm'),
        children: [
          { label: 'Adventure', slug: 'adventure', match: p => hasCategory(p, 'Adventure') },
          { label: 'Street', slug: 'street', match: p => hasCategory(p, 'Street') },
        ],
      },
      {
        label: 'Stiefel',
        slug: 'stiefel',
        match: p => isMotorrad(p) && hasType(p, 'Stiefel'),
      },
      {
        label: 'Protektoren',
        slug: 'protektoren',
        match: p => isMotorrad(p) && hasType(p, 'Protektor'),
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
    match: p => isMerchandise(p) || hasCategory(p, 'Casual Wear', 'Leisure'),
  },
];
