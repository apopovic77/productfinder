/**
 * Storage Annotation Service
 * Fetches AI-generated annotations from Storage API
 */

const STORAGE_API_BASE = 'https://api-storage.arkturian.com/storage';
const STORAGE_API_KEY = import.meta.env.VITE_STORAGE_API_KEY || 'oneal_demo_token';

export interface AnnotationAnchor {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
}

export interface AnnotationBox {
  x1: number; // 0-1 normalized
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  label: string;
  type: string;
  anchor: AnnotationAnchor;
  box?: AnnotationBox;
  confidence: number;
}

export interface StorageObjectMetadata {
  annotations?: Annotation[];
  trim_bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  product?: {
    name?: string;
    sku?: string;
    specifications?: Record<string, any>;
  };
}

/**
 * Fetch annotations for a storage object
 */
export async function fetchAnnotations(storageId: number): Promise<Annotation[]> {
  try {
    const response = await fetch(`${STORAGE_API_BASE}/objects/${storageId}`, {
      headers: {
        'X-API-Key': STORAGE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch annotations: ${response.status}`);
    }

    const data = await response.json();

    // Extract annotations from ai_context_metadata
    const annotations = data.ai_context_metadata?.embedding_info?.metadata?.annotations || [];

    // Convert box format from array [x1, y1, x2, y2] to object {x1, y1, x2, y2}
    return annotations.map((ann: any) => ({
      label: ann.label,
      type: ann.type,
      anchor: ann.anchor,
      box: ann.box ? {
        x1: ann.box[0],
        y1: ann.box[1],
        x2: ann.box[2],
        y2: ann.box[3],
      } : undefined,
      confidence: ann.confidence,
    }));
  } catch (error) {
    // Silently fail - not all products have annotations
    return [];
  }
}

/**
 * Fetch full storage object with all metadata
 */
export async function fetchStorageObject(storageId: number): Promise<StorageObjectMetadata | null> {
  try {
    const response = await fetch(`${STORAGE_API_BASE}/objects/${storageId}`, {
      headers: {
        'X-API-Key': STORAGE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch storage object: ${response.status}`);
    }

    const data = await response.json();

    // Extract annotations from ai_context_metadata
    const annotations = data.ai_context_metadata?.embedding_info?.metadata?.annotations || [];
    const trimBounds = data.ai_context_metadata?.trim_bounds;
    const product = data.ai_context_metadata?.product || data.metadata_json?.product;

    return {
      annotations,
      trim_bounds: trimBounds,
      product,
    };
  } catch (error) {
    console.warn('[StorageAnnotationService] Failed to fetch storage object:', error);
    return null;
  }
}
