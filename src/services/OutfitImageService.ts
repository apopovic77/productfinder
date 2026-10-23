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

function imageUrl(hash: string): string {
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
    return status.status === 'done' ? { ...status, url: imageUrl(status.hash) } : status;
  }
}
