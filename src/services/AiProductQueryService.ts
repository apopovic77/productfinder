const ONEAL_API_BASE = import.meta.env.VITE_ONEAL_API_BASE || '/oneal-api/v1';
const ONEAL_API_KEY = import.meta.env.VITE_ONEAL_API_KEY || 'oneal_demo_token';

export type AiQueryResult = {
  productIds: string[];
  rawText: string;
};

export class AiProductQueryService {
  static async queryProducts(userPrompt: string): Promise<AiQueryResult> {
    const response = await fetch(`${ONEAL_API_BASE}/products/ai/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ONEAL_API_KEY,
      },
      body: JSON.stringify({ query: userPrompt }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`AI-Suche fehlgeschlagen (${response.status}): ${detail || response.statusText}`);
    }

    const data = await response.json();
    const productIds = (data.product_ids || []).map((id: number) => String(id));
    const explanation = data.explanation || '';

    if (!productIds.length) {
      throw new Error(explanation || 'Keine passenden Produkte gefunden. Bitte Suche präzisieren.');
    }

    return { productIds, rawText: explanation };
  }
}
