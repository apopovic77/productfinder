import { describe, expect, it } from 'vitest';
import { ProductNormalizer } from '../ProductNormalizer';
import type { ShopifyProductNode } from '../types';

const baseNode: ShopifyProductNode = {
  id: 'gid://shopify/Product/1',
  handle: 'test-product',
  title: 'Test Product',
  bodyHtml: '<p>Body</p>',
  descriptionHtml: '<p>Desc</p>',
  vendor: 'O\'Neal',
  productType: 'Helmet',
  status: 'ACTIVE',
  tags: ['mtb', 'new'],
  publishedAt: '2025-01-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  options: [],
  variants: {
    edges: [
      {
        cursor: 'cursor',
        node: {
          id: 'gid://shopify/ProductVariant/1',
          title: 'Default',
          sku: 'SKU-1',
          barcode: null,
          price: '99.99',
          compareAtPrice: null,
          inventoryPolicy: 'DENY',
          requiresShipping: true,
          inventoryQuantity: 10,
          availableForSale: true,
          selectedOptions: [],
          image: null,
        },
      },
    ],
  },
  media: {
    edges: [
      {
        cursor: 'm',
        node: {
          __typename: 'MediaImage',
          id: 'gid://shopify/MediaImage/1',
          mediaContentType: 'IMAGE',
          alt: 'Product Image',
          image: {
            url: 'https://cdn.shopify.com/test.png',
            width: 100,
            height: 100,
          },
          preview: null,
        },
      },
    ],
  },
  metafields: {
    edges: [
      {
        node: {
          id: 'gid://shopify/Metafield/1',
          key: 'sport',
          namespace: 'detail',
          type: 'single_line_text_field',
          value: 'mountainbike',
        },
      },
    ],
  },
};

describe('ProductNormalizer', () => {
  it('maps Shopify product to domain model', () => {
    const normalizer = new ProductNormalizer();
    const product = normalizer.normalize(baseNode);

    expect(product.id).toBe(baseNode.id);
    expect(product.name).toBe(baseNode.title);
    expect(product.price?.value).toBe(99.99);
    expect(product.category).toContain('Helmet');
    expect(product.attributes?.sport?.value).toBe('mountainbike');
    expect(product.media?.[0]?.src).toMatch(/cdn\.shopify\.com/);
  });
});

