import { AgentDispatchService } from './AgentDispatchService';

const PRODUCT_SEARCH_AGENT =
  import.meta.env.VITE_PRODUCT_SEARCH_AGENT || 'OnealProductSearch';

/**
 * Der Productfinder zeigt nur den Katalog 2028. Ohne diesen Hinweis sucht der
 * Agent in allen Kollektionen und liefert IDs, die der Finder nicht kennt
 * (owner 2026-10-21, media 131708: sechs blaue Teile, keines im Katalog).
 */
const CATALOG_SCOPE_HINT =
  '[Productfinder Katalog 2028: products_search_ids immer mit workbook=true aufrufen. '
  + 'Bei Wuenschen wie "Ausruestung" oder "Outfit" je Produkttyp passende Teile suchen.]';

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
      `${userPrompt}\n\n${CATALOG_SCOPE_HINT}`,
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
