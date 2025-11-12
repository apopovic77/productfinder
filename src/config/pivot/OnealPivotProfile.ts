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

const PROTECTOR_FAMILY_LABELS: Array<{ label: string; keywords: string[] }> = [
  { label: 'OBERKÖRPER', keywords: ['chest', 'oberkörper', 'upper', 'body', 'torso', 'roost', 'brust', 'back', 'shoulder', 'vest', 'shirt', 'protector jacke', 'armour', 'armor'] },
  { label: 'KNIE', keywords: ['knee', 'knie', 'shin', 'schienbein', 'leg', 'schoner'] },
  { label: 'ELLENBOGEN', keywords: ['elbow', 'ellenbogen', 'arm'] },
  { label: 'NACKENSCHUTZ', keywords: ['neck', 'nacken', 'brace', 'collar'] },
];

const HELMET_FAMILY_LABELS: Array<{ label: string; keywords: string[] }> = [
  { label: 'FULL FACE HELME', keywords: ['fullface', 'full-face', 'integral', 'integralhelm', 'full face', 'closed face'] },
  { label: 'OPEN FACE HELME', keywords: ['open face', 'jethelm', 'jet-helm', 'half shell', 'half-shell', 'mx', 'motocross', 'bmx', 'dirt', 'trail'] },
];

const GOGGLE_FAMILY_LABELS: Array<{ label: string; keywords: string[] }> = [
  { label: 'B-10', keywords: ['b10', 'b-10'] },
  { label: 'B-22', keywords: ['b22', 'b-22'] },
  { label: 'B-33', keywords: ['b33', 'b-33'] },
  { label: 'B-55', keywords: ['b55', 'b-55'] },
  { label: 'VAULT', keywords: ['vault'] },
  { label: 'ZUBEHÖR', keywords: ['accessory', 'zubehör', 'tear off', 'tearo', 'roll-off', 'roll off', 'lens', 'scheibe'] },
  { label: 'GOGGLE-GUIDE', keywords: ['guide', 'fitting', 'kompatibilität', 'kompatibel'] },
];

const PRODUCT_FAMILY_ORDERS: Record<string, readonly string[]> = {
  Kleidung: CLOTHING_FAMILY_LABELS.map(item => item.label),
  Protektoren: [
    'OBERKÖRPER',
    'KNIE',
    'ELLENBOGEN',
    'NACKENSCHUTZ',
    'WEITERE',
  ],
  Helme: [
    'FULL FACE HELME',
    'OPEN FACE HELME',
  ],
  Brillen: [
    'B-10',
    'B-22',
    'B-33',
    'B-55',
    'VAULT',
    'ZUBEHÖR',
    'GOGGLE-GUIDE',
  ],
};

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

  const combinedText = `${primary} ${secondary} ${name} ${url} ${family} ${taxonomyTokens.join(' ')}`;
  const combinedProtectorText = combinedText;
  const looksLikeProtector = PROTECTOR_KEYWORDS.some(keyword => combinedProtectorText.includes(keyword));

  // DEBUG: Log category decisions
  const result = (() => {

  if (looksLikeProtector) {
    return 'Protektoren';
  }

  if (name.includes('goggle') || name.includes('brille') || url.includes('goggle')) {
    return 'Brillen';
  }

  const SHOE_REGEX = /(?:^|[^a-z])(boot|boots|stiefel|shoe|shoes|schuh|schuhe|sneaker)(?:[^a-z]|$)/;
  const GLOVE_REGEX = /(handschuh|handschuhe|glove|gloves)/;
  const shoeLike = SHOE_REGEX.test(combinedText) && !GLOVE_REGEX.test(combinedText);
  if (shoeLike) {
    return 'Schuhe & Stiefel';
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
  })();

  // DEBUG: Log if product is categorized as Helme
  if (result === 'Helme') {
    console.log('[CATEGORY DEBUG] Helme:', {
      name: args.productName,
      primary,
      secondary,
      family,
      reason: primary === 'helmets' ? 'primary=helmets' : name.includes('helm') ? 'name contains helm' : 'unknown'
    });
  }

  return result;
}

function normalizeProductFamily(args: NormalizeProductFamilyArgs): string | undefined {
  const { presentationCategory, rawFamily, taxonomyPath, productName } = args;
  const lowerName = productName.toLowerCase();
  const lowerPath = (taxonomyPath ?? []).map(token => token.toLowerCase());
  const trimmedFamily = rawFamily?.trim() ?? '';
  const lowerFamily = trimmedFamily.toLowerCase();

  const matchByKeywords = (labels: Array<{ label: string; keywords: string[] }>): string | undefined => {
    for (const { label, keywords } of labels) {
      const matchKeyword = keywords.some(keyword =>
        lowerName.includes(keyword) || lowerPath.includes(keyword) || lowerFamily.includes(keyword)
      );
      if (matchKeyword) {
        return label;
      }
    }
    return undefined;
  };

  if (presentationCategory === 'Kleidung') {
    const match = matchByKeywords(CLOTHING_FAMILY_LABELS);
    if (match) return match;
  }

  if (presentationCategory === 'Protektoren') {
    const match = matchByKeywords(PROTECTOR_FAMILY_LABELS);
    if (match) return match;
  }

  if (presentationCategory === 'Helme') {
    const match = matchByKeywords(HELMET_FAMILY_LABELS);
    if (match) return match;
  }

  if (presentationCategory === 'Brillen') {
    const match = matchByKeywords(GOGGLE_FAMILY_LABELS);
    if (match) return match;
  }

  if (!trimmedFamily) {
    if (presentationCategory === 'Protektoren') return 'WEITERE';
    if (presentationCategory === 'Helme') return 'OPEN FACE HELME';
    if (presentationCategory === 'Brillen') return 'ZUBEHÖR';
    return undefined;
  }

  const formatted = trimmedFamily
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!formatted) {
    if (presentationCategory === 'Protektoren') return 'WEITERE';
    if (presentationCategory === 'Helme') return 'OPEN FACE HELME';
    if (presentationCategory === 'Brillen') return 'ZUBEHÖR';
    return undefined;
  }

  if (presentationCategory === 'Protektoren') {
    const upper = formatted.toUpperCase();
    if (upper.includes('OBER') || upper.includes('CHEST') || upper.includes('BODY') || upper.includes('TORSO')) {
      return 'OBERKÖRPER';
    }
    if (upper.includes('KNEE') || upper.includes('KNIE') || upper.includes('SHIN') || upper.includes('SCHIEN')) {
      return 'KNIE';
    }
    if (upper.includes('ELBOW') || upper.includes('ELLEN')) {
      return 'ELLENBOGEN';
    }
    if (upper.includes('NECK') || upper.includes('NACKEN') || upper.includes('BRACE') || upper.includes('COLLAR')) {
      return 'NACKENSCHUTZ';
    }
    return 'WEITERE';
  }

  if (presentationCategory === 'Helme') {
    const lower = formatted.toLowerCase();
    if (lower.includes('full')) return 'FULL FACE HELME';
    return 'OPEN FACE HELME';
  }

  if (presentationCategory === 'Brillen') {
    const upper = formatted.toUpperCase();
    if (upper.includes('B-10') || upper.includes('B10')) return 'B-10';
    if (upper.includes('B-22') || upper.includes('B22')) return 'B-22';
    if (upper.includes('B-33') || upper.includes('B33')) return 'B-33';
    if (upper.includes('B-55') || upper.includes('B55')) return 'B-55';
    if (upper.includes('VAULT')) return 'VAULT';
    if (upper.includes('GUIDE')) return 'GOGGLE-GUIDE';
    return 'ZUBEHÖR';
  }

  return formatted.replace(/(^|\s)\w/g, match => match.toUpperCase());
}

function getProductFamilyOrderForCategory(category: string): readonly string[] | undefined {
  return PRODUCT_FAMILY_ORDERS[category];
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
  productFamilyOrders: PRODUCT_FAMILY_ORDERS,
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
    if (parentDimension === 'category:presentation' && parentValue === 'Protektoren') {
      return 'attribute:product_family';
    }
    if (parentDimension === 'category:presentation' && parentValue === 'Helme') {
      return 'attribute:product_family';
    }
    if (parentDimension === 'category:presentation' && parentValue === 'Brillen') {
      return 'attribute:product_family';
    }
    return undefined;
  },
  getPreferredGrandchildDimension(parentDimension, parentValue, childDimension, childValue) {
    if (
      parentDimension === 'category:presentation' &&
      parentValue === 'Kleidung' &&
      childDimension === 'attribute:product_family'
    ) {
      if (childValue === 'HOSEN' || childValue === 'SHORTS') {
        return 'attribute:taxonomy_sport';
      }
    }
    return undefined;
  },
  getProductFamilyOrderForCategory: getProductFamilyOrderForCategory,
};
