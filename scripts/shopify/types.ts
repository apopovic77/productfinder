export interface ShopifyProductPage {
  edges: ShopifyProductEdge[];
  pageInfo: ShopifyPageInfo;
}

export interface ShopifyProductEdge {
  cursor: string;
  node: ShopifyProductNode;
}

export interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  bodyHtml: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  options: ShopifyProductOption[];
  variants: ShopifyVariantConnection;
  media: ShopifyMediaConnection;
  metafields: ShopifyMetafieldConnection;
}

export interface ShopifyProductOption {
  id: string;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyVariantConnection {
  edges: Array<{
    cursor: string;
    node: ShopifyVariantNode;
  }>;
}

export interface ShopifyVariantNode {
  id: string;
  title: string;
  sku: string;
  barcode?: string | null;
  price: string;
  compareAtPrice?: string | null;
  inventoryPolicy: string;
  requiresShipping: boolean;
  inventoryQuantity?: number | null;
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  image?: ShopifyImage | null;
}

export interface ShopifyMediaConnection {
  edges: Array<{
    cursor: string;
    node: ShopifyMediaNode;
  }>;
}

export type ShopifyMediaNode = ShopifyImage | ShopifyExternalVideo | ShopifyModel3D | ShopifyVideo;

export interface ShopifyImage {
  __typename: 'MediaImage' | 'Image';
  id: string;
  alt?: string | null;
  mediaContentType: string;
  image?: {
    url: string;
    width?: number | null;
    height?: number | null;
  } | null;
  originalSource?: string | null;
  preview?: { image?: { url: string } | null } | null;
}

export interface ShopifyExternalVideo {
  __typename: 'ExternalVideo';
  id: string;
  mediaContentType: string;
  host: string;
  originUrl: string;
}

export interface ShopifyModel3D {
  __typename: 'Model3d';
  id: string;
  mediaContentType: string;
  originalSource?: { url: string } | null;
}

export interface ShopifyVideo {
  __typename: 'Video';
  id: string;
  mediaContentType: string;
  sources?: Array<{ url: string }> | null;
}

export interface ShopifyMetafieldConnection {
  edges: Array<{
    node: ShopifyMetafield;
  }>;
}

export interface ShopifyMetafield {
  id: string;
  key: string;
  namespace: string;
  type: string;
  value: string;
}

export interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface GraphqlCost {
  requestedQueryCost: number;
  actualQueryCost: number;
  throttleStatus: {
    maximumAvailable: number;
    currentlyAvailable: number;
    restoreRate: number;
  };
}

export interface ShopifyGraphqlResponse<T> {
  data: T;
  extensions?: {
    cost?: GraphqlCost;
  };
  errors?: Array<{ message: string }>;
}

export interface ProductsQueryResponse {
  products: {
    edges: ShopifyProductEdge[];
    pageInfo: ShopifyPageInfo;
  };
}

