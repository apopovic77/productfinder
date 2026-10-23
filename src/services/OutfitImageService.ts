import { ONEAL_API_BASE, ONEAL_API_KEY } from '../config/apiConfig';

/**
 * Outfit-Bild der Smart Search (owner 2026-10-22): oneal-api-v2 holt die
 * Szene aus dem Katalog und laesst OnealProductSearch daraus ein Bild
 * erzeugen (Codex-Bildgenerierung, ca. 1–2 Minuten). Hier: anfragen und den
 * Stand abfragen, bis das Bild da ist.
 */
export type OutfitImageStatus = {
  hash: string;
  status: 'pending' | 'done' | 'failed' | 'unsupported';
  url?: string | null;
  detail?: string | null;
};

/** Hintergrund des KI-Bildes (owner 2026-10-23: Standard transparent). */
export type OutfitBackground = 'transparent' | 'studio';

const POLL_MS = 3000;
const MAX_WAIT_MS = 300_000;

const headers = { 'Content-Type': 'application/json', 'X-API-Key': ONEAL_API_KEY };

export function outfitImageUrl(hash: string): string {
  return `${ONEAL_API_BASE}/outfit-image/${hash}.png`;
}

export class OutfitImageService {
  /** Bild anfordern und warten; isCurrent() = false bricht still ab (neue Suche). */
  static async generate(ids: string[], isCurrent: () => boolean, background: OutfitBackground = 'transparent'): Promise<OutfitImageStatus> {
    const res = await fetch(`${ONEAL_API_BASE}/outfit-image`, {
      method: 'POST',
      headers,
      // transparent = freigestellt (Alpha), studio = Standard-Hintergrund des Katalogs
      body: JSON.stringify(background === 'transparent' ? { ids, style: 'transparent' } : { ids }),
    });
    if (!res.ok) throw new Error(`Outfit-Bild: HTTP ${res.status}`);
    let status = (await res.json()) as OutfitImageStatus;
    const started = Date.now();
    while (status.status === 'pending' && isCurrent() && Date.now() - started < MAX_WAIT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
      const poll = await fetch(`${ONEAL_API_BASE}/outfit-image/${status.hash}`, { headers });
      if (!poll.ok) throw new Error(`Outfit-Bild: HTTP ${poll.status}`);
      status = (await poll.json()) as OutfitImageStatus;
    }
    if (status.status === 'pending') status = { ...status, status: 'failed', detail: 'Zeitueberschreitung' };
    return status.status === 'done' ? { ...status, url: outfitImageUrl(status.hash) } : status;
  }
}

/** Gespeichertes KI-Outfit ("Meine Outfits", owner 2026-10-23). */
export type SavedOutfit = {
  hash: string;
  ids: string[];
  background: OutfitBackground;
  query?: string | null;
  created_at?: string | null;
};

/**
 * Besitzer der Outfit-Liste: angemeldetes Haendlerkonto, sonst dieser
 * Browser (zufaellige ID, im localStorage gemerkt).
 */
export function outfitOwner(customerNumber?: string | null): string {
  if (customerNumber) return `kunde-${String(customerNumber).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
  try {
    let id = localStorage.getItem('pf-device-id');
    if (!id) {
      id = `browser-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('pf-device-id', id);
    }
    return id;
  } catch {
    return 'browser-anonym';
  }
}

export class SavedOutfitService {
  static async list(owner: string): Promise<SavedOutfit[]> {
    const res = await fetch(`${ONEAL_API_BASE}/outfit-image/saved?owner=${encodeURIComponent(owner)}`, { headers });
    return res.ok ? res.json() : [];
  }

  static async save(owner: string, outfit: SavedOutfit): Promise<SavedOutfit[] | null> {
    const res = await fetch(`${ONEAL_API_BASE}/outfit-image/saved`, {
      method: 'POST', headers, body: JSON.stringify({ owner, ...outfit }),
    });
    return res.ok ? res.json() : null;
  }

  static async remove(owner: string, hash: string): Promise<SavedOutfit[] | null> {
    const res = await fetch(`${ONEAL_API_BASE}/outfit-image/saved/${hash}?owner=${encodeURIComponent(owner)}`, {
      method: 'DELETE', headers,
    });
    return res.ok ? res.json() : null;
  }
}

/**
 * Merkliste (Herz an Produkten, owner 2026-10-23): Produkt-IDs je Besitzer,
 * neueste zuerst, im Bereich "Meine Auswahl" neben den Outfits.
 */
export class FavoriteProductService {
  static async list(owner: string): Promise<string[]> {
    const res = await fetch(`${ONEAL_API_BASE}/favorites?owner=${encodeURIComponent(owner)}`, { headers });
    return res.ok ? res.json() : [];
  }

  static async add(owner: string, productId: string): Promise<string[] | null> {
    const res = await fetch(`${ONEAL_API_BASE}/favorites`, {
      method: 'POST', headers, body: JSON.stringify({ owner, product_id: productId }),
    });
    return res.ok ? res.json() : null;
  }

  static async remove(owner: string, productId: string): Promise<string[] | null> {
    const res = await fetch(`${ONEAL_API_BASE}/favorites/${encodeURIComponent(productId)}?owner=${encodeURIComponent(owner)}`, {
      method: 'DELETE', headers,
    });
    return res.ok ? res.json() : null;
  }
}
