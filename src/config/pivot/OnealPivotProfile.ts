import type {
  DerivePresentationCategoryArgs,
  NormalizeProductFamilyArgs,
  PivotProfile,
  PresentationCategory,
} from './PivotProfile';

const PRESENTATION_CATEGORY_ORDER: PresentationCategory[] = [
  'Helme',
  'Brillen',
  'Kleidung',
  'Protektoren',
  'Schuhe & Stiefel',
  'Accessoires',
];

const CLOTHING_FAMILY_LABELS: Array<{ label: string; keywords: string[] }> = [
  { label: 'JERSEYS', keywords: ['jersey'] },
  { label: 'SHORTS', keywords: ['short'] },
  { label: 'HOSEN', keywords: ['pant', 'hose'] },
  { label: 'JACKEN', keywords: ['jacket', 'jacke'] },
  { label: 'REGENKLEIDUNG', keywords: ['rain', 'regen'] },
  { label: 'HANDSCHUHE', keywords: ['glove', 'handschuh'] },
];

const PROTECTOR_KEYWORDS = [
  'protector',
  'protektor',
  'schutz',
  'guard',
  'elbow',
  'knee',
  'shoulder',
  'armour',
  'armor',
  'brace',
  'pad',
];

const CLOTHING_CONTEXT_TOKENS = new Set([
  'jersey',
  'jerseys',
  'pants',
  'pant',
  'hose',
  'hosen',
  'short',
  'shorts',
  'jackets',
  'jacket',
  'jacken',
  'jacke',
  'regen',
  'rain',
  'glove',
  'gloves',
  'handschuh',
  'handschuhe',
  'shirt',
  'shirts',
]);

const PROTECTOR_CONTEXT_TOKENS = new Set([
  'protector',
  'protektoren',
  'protektor',
  'schutz',
  'guard',
  'brace',
  'armor',
  'armour',
  'elbow',
  'knee',
  'shoulder',
  'pad',
  'pads',
]);

const TOKEN_LABEL_MAP: Record<string, string> = {
  mtb: 'Mountainbike',
  mountainbike: 'Mountainbike',
  mx: 'Motocross',
  motocross: 'Motocross',
  gravity: 'Gravity',
  freeride: 'Freeride',
  downhill: 'Downhill',
  enduro: 'Enduro',
  trail: 'Trail',
  urban: 'Urban',
  street: 'Street',
  bike: 'Bike',
  bikes: 'Bikes',
  bmx: 'BMX',
  kids: 'Kids',
  youth: 'Youth',
  junior: 'Junior',
  women: 'Women',
  womens: 'Women',
  men: 'Men',
  mens: 'Men',
  unisex: 'Unisex',
  helmets: 'Helme',
  helmet: 'Helm',
  fullface: 'Fullface',
  goggles: 'Brillen',
  goggle: 'Brille',
  gloves: 'Handschuhe',
  glove: 'Handschuh',
  clothing: 'Kleidung',
  apparel: 'Bekleidung',
  accessories: 'Accessoires',
  accessory: 'Accessoire',
  protectors: 'Protektoren',
  protector: 'Protektor',
  protection: 'Protection',
  pants: 'Hosen',
  shorts: 'Shorts',
  jersey: 'Jersey',
  jerseys: 'Jerseys',
  jacket: 'Jacke',
  jackets: 'Jacken',
  rain: 'Regen',
  rainwear: 'Regenbekleidung',
  boot: 'Stiefel',
  boots: 'Stiefel',
  shoes: 'Schuhe',
  lifestyle: 'Lifestyle',
  casual: 'Casual',
};

function formatSimpleToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return '';

  if (TOKEN_LABEL_MAP[normalized]) {
    return TOKEN_LABEL_MAP[normalized];
  }

  const cleaned = normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (TOKEN_LABEL_MAP[cleaned]) {
    return TOKEN_LABEL_MAP[cleaned];
  }

  const words = cleaned
    .split(' ')
    .filter(Boolean)
    .map(word => {
      if (TOKEN_LABEL_MAP[word]) {
        return TOKEN_LABEL_MAP[word];
      }
      if (/^[a-z]{1,3}$/.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

  if (words.length) {
    return words.join(' ');
  }

  return token.trim();
}

function formatTokenLabel(token?: string | null): string | undefined {
  if (!token) return undefined;
  const trimmed = token.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map(part => part.trim()).filter(Boolean);
    if (parts.length) {
      return parts.map(part => formatSimpleToken(part)).join(' / ');
    }
  }

  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(part => part.trim()).filter(Boolean);
    if (parts.length) {
      return parts.map(part => formatSimpleToken(part)).join(' | ');
    }
  }

  return formatSimpleToken(trimmed);
}

function formatTokenPath(tokens?: string[]): string | undefined {
  if (!tokens?.length) return undefined;
  const formatted = tokens
    .map(token => formatTokenLabel(token))
    .filter((value): value is string => Boolean(value));
  if (!formatted.length) return undefined;
  return formatted.join(' > ');
}

function derivePresentationCategory(args: DerivePresentationCategoryArgs): PresentationCategory {
  const primary = args.primaryCategory?.toLowerCase().trim() ?? '';
  const secondary = args.secondaryCategory?.toLowerCase().trim() ?? '';
  const name = args.productName.toLowerCase();
  const url = args.productUrl?.toLowerCase() ?? '';
  const taxonomy = args.taxonomy;
  const family = taxonomy?.product_family?.toLowerCase() ?? '';
  const taxonomyTokens = taxonomy?.path?.map(token => token.toLowerCase()) ?? [];

  const combinedProtectorText = `${primary} ${secondary} ${name} ${url} ${family} ${taxonomyTokens.join(' ')}`;
  const looksLikeProtector = PROTECTOR_KEYWORDS.some(keyword => combinedProtectorText.includes(keyword));

  if (looksLikeProtector) {
    return 'Protektoren';
  }

  if (name.includes('goggle') || name.includes('brille') || url.includes('goggle')) {
    return 'Brillen';
  }

  switch (primary) {
    case 'helmets':
      return 'Helme';
    case 'protectors':
      return 'Protektoren';
    case 'shoes':
      return 'Schuhe & Stiefel';
    case 'accessories':
      return 'Accessoires';
    case 'clothing':
    case 'gloves':
      return 'Kleidung';
    case 'other':
      if (secondary === 'protectors') return 'Protektoren';
      if (secondary === 'shoes') return 'Schuhe & Stiefel';
      break;
  }

  if (name.includes('helmet') || name.includes('helm')) return 'Helme';
  if (name.includes('protector') || name.includes('protektor')) return 'Protektoren';
  if (name.includes('boot') || name.includes('stiefel') || name.includes('shoe')) return 'Schuhe & Stiefel';
  if (
    name.includes('glove') ||
    name.includes('handschuh') ||
    name.includes('jersey') ||
    name.includes('hose') ||
    name.includes('pant') ||
    name.includes('shirt')
  ) {
    return 'Kleidung';
  }

  return 'Accessoires';
}

function normalizeProductFamily(args: NormalizeProductFamilyArgs): string | undefined {
  const { presentationCategory, rawFamily, taxonomyPath, productName } = args;
  if (!rawFamily && !taxonomyPath?.length) return undefined;
  const lowerName = productName.toLowerCase();
  const lowerPath = (taxonomyPath ?? []).map(token => token.toLowerCase());
  const lowerFamily = (rawFamily ?? '').toLowerCase();

  const isClothing = presentationCategory === 'Kleidung';
  if (isClothing) {
    for (const { label, keywords } of CLOTHING_FAMILY_LABELS) {
      const matchKeyword = keywords.some(keyword =>
        lowerName.includes(keyword) || lowerPath.includes(keyword) || lowerFamily.includes(keyword)
      );
      if (matchKeyword) {
        return label;
      }
    }
  }

  if (!rawFamily) return undefined;
  return rawFamily
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\w/g, match => match.toUpperCase());
}

function isClothingContext(text: string): boolean {
  const lower = text.toLowerCase();
  for (const token of CLOTHING_CONTEXT_TOKENS) {
    if (lower.includes(token)) {
      return true;
    }
  }
  return false;
}

function isProtectorContext(text: string): boolean {
  const lower = text.toLowerCase();
  for (const token of PROTECTOR_CONTEXT_TOKENS) {
    if (lower.includes(token)) {
      return true;
    }
  }
  return false;
}

export const ONEAL_PIVOT_PROFILE: PivotProfile = {
  name: 'oneal',
  presentationCategoryOrder: PRESENTATION_CATEGORY_ORDER,
  productFamilyOrder: CLOTHING_FAMILY_LABELS.map(item => item.label),
  heroThreshold: 10,
  priceRefineThreshold: 8,
  derivePresentationCategory,
  normalizeProductFamily,
  formatTokenLabel,
  formatTokenPath,
  isClothingContext,
  isProtectorContext,
  getPreferredChildDimension(parentDimension, parentValue) {
    if (parentDimension === 'category:presentation' && parentValue === 'Kleidung') {
      return 'attribute:product_family';
    }
    return undefined;
  },
};
