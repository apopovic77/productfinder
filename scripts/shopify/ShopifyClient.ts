import { sleep } from './utils.ts';
import type {
  GraphqlCost,
  ProductsQueryResponse,
  ShopifyProductPage,
} from './types.js';
import type { ShopifyConfig } from './config.ts';

const DEFAULT_PAGE_SIZE = 50;

export class ShopifyClient {
  private readonly endpoint: string;

  constructor(private readonly config: ShopifyConfig) {
    this.endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;
  }

  async fetchProductsPage(cursor?: string, pageSize: number = DEFAULT_PAGE_SIZE): Promise<ShopifyProductPage> {
    const variables: Record<string, unknown> = { first: pageSize };
    if (cursor) {
      variables.after = cursor;
    }
    if (this.config.updatedSince) {
      variables.query = `updated_at:>=${this.config.updatedSince}`;
    }

    const { data } = await this.query<ProductsQueryResponse>(PRODUCTS_QUERY, variables);
    return data.products;
  }

  private async query<T>(query: string, variables?: Record<string, unknown>): Promise<{ data: T }> {
    let attempt = 0;
    while (true) {
      attempt += 1;
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.config.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          if (attempt >= this.config.maxRetryAttempts) {
            const text = await response.text();
            throw new Error(`Shopify API error (${response.status}): ${text}`);
          }
          const retryAfter = Number(response.headers.get('Retry-After') ?? '0') * 1000;
          const backoff = retryAfter || attempt * 1000;
          await sleep(backoff);
          continue;
        }
        const text = await response.text();
        throw new Error(`Shopify API error (${response.status} ${response.statusText}): ${text}`);
      }

      const payload = (await response.json()) as {
      data: T;
      errors?: Array<{ message: string }>;
      extensions?: { cost?: GraphqlCost };
    };

    if (payload.errors?.length) {
      throw new Error(`Shopify API returned errors: ${payload.errors.map((e) => e.message).join('; ')}`);
    }

      await this.enforceThrottle(payload.extensions?.cost);
      return { data: payload.data };
    }
  }

  private async enforceThrottle(cost?: GraphqlCost): Promise<void> {
    if (!cost) return;
    const { currentlyAvailable, restoreRate } = cost.throttleStatus;
    if (currentlyAvailable >= this.config.minAvailableBudget) {
      return;
    }

    const deficit = this.config.minAvailableBudget - currentlyAvailable;
    const waitSeconds = deficit / restoreRate;
    const waitMs = Math.ceil(waitSeconds * 1000);
    await sleep(waitMs);
  }
}

const PRODUCTS_QUERY = /* GraphQL */ `
  query SyncProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT, query: $query) {
      edges {
        cursor
        node {
          id
          handle
          title
          bodyHtml
          descriptionHtml
          vendor
          productType
          status
          tags
          publishedAt
          createdAt
          updatedAt
          options {
            id
            name
            position
            values
          }
          variants(first: 100) {
            edges {
              cursor
              node {
                id
                title
                sku
                barcode
                price
                compareAtPrice
                inventoryPolicy
                requiresShipping
                inventoryQuantity
                availableForSale
                selectedOptions {
                  name
                  value
                }
                image {
                  id
                  mediaContentType
                  alt
                  image {
                    url
                    width
                    height
                  }
                }
              }
            }
          }
          media(first: 30) {
            edges {
              cursor
              node {
                __typename
                ... on MediaImage {
                  id
                  mediaContentType
                  alt
                  image {
                    url
                    width
                    height
                  }
                  preview {
                    image {
                      url
                    }
                  }
                }
                ... on ExternalVideo {
                  id
                  mediaContentType
                  host
                  originUrl
                }
                ... on Model3d {
                  id
                  mediaContentType
                  originalSource {
                    url
                  }
                }
                ... on Video {
                  id
                  mediaContentType
                  sources {
                    url
                  }
                }
              }
            }
          }
          metafields(first: 25) {
            edges {
              node {
                id
                key
                namespace
                type
                value
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

