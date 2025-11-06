const AI_BASE_URL = import.meta.env.VITE_AI_API_BASE || 'https://api-ai.arkturian.com';
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY || '';

const SYSTEM_INSTRUCTIONS = `You are an expert product search assistant for O'Neal.
- Use the MCP product knowledge available at mcp.arkturian.com/oneal and mcp.arkturian.com/oneal-storage to understand the catalogue structure.
- Always respond **only** with valid JSON of the shape {"product_ids": ["id1", "id2", ...]}.
- Product IDs must correspond to the "id" field returned by the Oneal Product API (e.g. "mtb-0050-oneal-redeema-knieschutzer").
- You may return up to 40 relevant product IDs, ordered by best match.
- If nothing matches, return {"product_ids": []}.
Do not include explanations, markdown, or additional fields.`;

export type AiQueryResult = {
  productIds: string[];
  rawText: string;
};

export class AiProductQueryService {
  static async queryProducts(userPrompt: string): Promise<AiQueryResult> {
    const prompt = buildPrompt(userPrompt);
    const response = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/ai/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_API_KEY ? { 'X-API-KEY': AI_API_KEY } : {}),
      },
      body: JSON.stringify({
        prompt: {
          text: prompt,
        },
      }),
    });

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new Error(`AI request failed (${response.status}): ${detail || response.statusText}`);
    }

    const data = await response.json();
    const rawText: string = data?.response ?? data?.message ?? JSON.stringify(data);
    const productIds = extractProductIds(rawText);
    if (!productIds.length) {
      throw new Error('Die KI konnte keine Produkt-IDs finden. Bitte Prompt präzisieren.');
    }
    return { productIds, rawText };
  }
}

function buildPrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim();
  return `${SYSTEM_INSTRUCTIONS}\n\nNutzeranfrage: ${trimmed}`;
}

function extractProductIds(rawText: string): string[] {
  if (!rawText) return [];

  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed?.product_ids)) {
      return sanitizeIds(parsed.product_ids);
    }
  } catch (err) {
    // ignore, try to locate JSON within text
  }

  const match = rawText.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed?.product_ids)) {
        return sanitizeIds(parsed.product_ids);
      }
    } catch (err) {
      // ignore
    }
  }

  const listMatches = rawText.match(/["']([a-z0-9\-]+)["']/gi);
  if (listMatches) {
    const ids = listMatches.map(m => m.replace(/["']/g, '')).filter(Boolean);
    return sanitizeIds(ids);
  }

  return [];
}

function sanitizeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    const normalized = String(id).trim();
    if (normalized) {
      seen.add(normalized);
    }
    if (seen.size >= 40) break;
  }
  return Array.from(seen);
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}


