import { AgentDispatchService } from './AgentDispatchService';

const PRODUCT_SEARCH_AGENT =
  import.meta.env.VITE_PRODUCT_SEARCH_AGENT || 'OnealProductSearch';

export type AiQueryResult = {
  productIds: string[];
  rawText: string;
};

type AgentResponse = {
  ids: number[];
  explanation?: string;
};

export class AiProductQueryService {
  static async queryProducts(userPrompt: string): Promise<AiQueryResult> {
    const data = await AgentDispatchService.query<AgentResponse>(
      PRODUCT_SEARCH_AGENT,
      userPrompt,
    );

    if (!Array.isArray(data.ids)) {
      throw new Error(data.explanation || 'AI-Suche lieferte ein ungültiges Ergebnis.');
    }

    if (!data.ids.length) {
      throw new Error(data.explanation || 'Keine passenden Produkte gefunden.');
    }

    return {
      productIds: data.ids.map((id) => String(id)),
      rawText: data.explanation || '',
    };
  }
}
