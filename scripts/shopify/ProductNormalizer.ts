import type {
  MediaItem,
  ProductAttributeInit,
  ProductData,
  ProductVariant,
} from '../../src/types/Product';
import type {
  ShopifyImage,
  ShopifyMetafield,
  ShopifyProductNode,
  ShopifyVariantNode,
} from './types';

export interface ProductNormalizerOptions {
  defaultCurrency?: string;
  /** e.g. https://store/products/{handle} */
  productUrlTemplate?: (handle: string) => string;
}

const DEFAULT_OPTIONS: Required<ProductNormalizerOptions> = {
  defaultCurrency: 'EUR',
  productUrlTemplate: (handle: string) => `https://oneal.eu/products/${handle}`,
};

export class ProductNormalizer {
  private readonly options: Required<ProductNormalizerOptions>;

  constructor(options: ProductNormalizerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  normalize(node: ShopifyProductNode): ProductData {
    const variants = node.variants.edges.map((edge) => this.mapVariant(edge.node));
    const primaryVariant = variants[0];
    const price = this.buildPrice(primaryVariant);

    return {
      id: node.id,
      sku: primaryVariant?.sku,
      name: node.title,
      brand: node.vendor || undefined,
      category: this.buildCategories(node),
      price,
      media: this.mapMedia(node),
      description: node.bodyHtml || node.descriptionHtml || undefined,
      displayName: node.title,
      meta: this.buildMeta(node),
      attributes: this.buildAttributes(node),
      aiTags: node.tags,
      variants,
      raw: node as unknown as Record<string, unknown>,
    };
  }

  private buildPrice(variant?: ProductVariant): ProductData['price'] {
    if (!variant?.price) return undefined;
    const value = variant.price;
    const currency = variant.currency || this.options.defaultCurrency;
    return {
      currency,
      value,
      formatted: `${value.toFixed(2)} ${currency}`,
    };
  }

  private buildCategories(node: ShopifyProductNode): string[] {
    const categories = new Set<string>();
    if (node.productType) categories.add(node.productType);
    const sport = this.findMetafieldValue(node.metafields.edges, 'detail', 'sport')
      ?? this.findMetafieldValue(node.metafields.edges, 'custom', 'sport');
    if (sport) categories.add(sport);
    return Array.from(categories).filter(Boolean);
  }

  private buildMeta(node: ShopifyProductNode): Record<string, unknown> {
    const productUrl = this.options.productUrlTemplate(node.handle);
    return {
      source: 'shopify',
      shopify_handle: node.handle,
      shopify_status: node.status,
      shopify_tags: node.tags,
      shopify_product_url: productUrl,
      created_at: node.createdAt,
      updated_at: node.updatedAt,
    };
  }

  private buildAttributes(node: ShopifyProductNode): Record<string, ProductAttributeInit> {
    const attrs: Record<string, ProductAttributeInit> = {};
    const push = (key: string, init: ProductAttributeInit | undefined) => {
      if (init) attrs[key] = init;
    };

    push('product_type', this.makeAttr('Product Type', 'enum', node.productType, 'productType'));
    push('status', this.makeAttr('Status', 'enum', node.status, 'status'));
    push('published_at', this.makeAttr('Published At', 'date', node.publishedAt, 'publishedAt'));

    if (node.tags?.length) {
      push('tags', {
        label: 'Tags',
        type: 'enum',
        value: node.tags.join(', '),
        sourcePath: 'tags',
      });
    }

    const sport = this.findMetafieldValue(node.metafields.edges, 'detail', 'sport')
      ?? this.findMetafieldValue(node.metafields.edges, 'custom', 'sport');
    if (sport) {
      push('sport', {
        label: 'Sport',
        type: 'enum',
        value: sport,
        sourcePath: 'metafields.detail.sport',
      });
    }

    return attrs;
  }

  private makeAttr(
    label: string,
    type: ProductAttributeInit['type'],
    value?: string | null,
    sourcePath?: string,
  ): ProductAttributeInit | undefined {
    if (!value) return undefined;
    return { label, type, value, sourcePath };
  }

  private mapVariant(variant: ShopifyVariantNode): ProductVariant {
    return {
      name: variant.title,
      sku: variant.sku || undefined,
      price: variant.price ? Number(variant.price) : undefined,
      currency: this.options.defaultCurrency,
      availability: variant.availableForSale ? 'in_stock' : 'out_of_stock',
      option1: variant.selectedOptions?.[0]?.value,
      option2: variant.selectedOptions?.[1]?.value,
    };
  }

  private mapMedia(node: ShopifyProductNode): MediaItem[] {
    const mediaItems: MediaItem[] = [];
    for (const edge of node.media.edges) {
      const mediaNode = edge.node;
      if (mediaNode.__typename === 'MediaImage' && mediaNode.image) {
        mediaItems.push(this.mapImage(mediaNode.image, mediaNode.alt ?? undefined));
      } else if (mediaNode.__typename === 'Image' && mediaNode.image) {
        mediaItems.push(this.mapImage(mediaNode.image, mediaNode.alt ?? undefined));
      }
    }

    // Fallback to legacy images (variant image)
    for (const variantEdge of node.variants.edges) {
      const variantImage = variantEdge.node.image;
      if (variantImage?.image) {
        mediaItems.push(this.mapImage(variantImage.image, variantImage.alt ?? undefined));
      }
    }

    return dedupeMedia(mediaItems);
  }

  private mapImage(image: ShopifyImage['image'], alt?: string): MediaItem {
    return {
      src: image?.url ?? '',
      alt: alt ?? undefined,
      type: 'image',
    };
  }

  private findMetafieldValue(
    edges: Array<{ node: ShopifyMetafield }>,
    namespace: string,
    key: string,
  ): string | undefined {
    const entry = edges.find((edge) => edge.node.namespace === namespace && edge.node.key === key);
    return entry?.node.value;
  }
}

function dedupeMedia(media: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const item of media) {
    if (!item.src) continue;
    if (seen.has(item.src)) continue;
    seen.add(item.src);
    result.push(item);
  }
  return result;
}

