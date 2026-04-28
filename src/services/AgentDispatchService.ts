/**
 * Dispatch a request to a cloud-api Claude agent via the queue API.
 *
 * Flow:
 *   POST /api/queue/{agent}/message       → { id }
 *   GET  /api/queue/{agent}/message/{id}/stream  (SSE)
 *     → { status: "processing" | "done" | "error", response?, message? }
 *
 * The agent's response is expected to be valid JSON. Cloud strips tmux
 * artifacts server-side; until that fix is deployed we fall back to
 * extracting the first balanced `{…}` block from the raw text.
 */

const DEFAULT_DISPATCH_BASE =
  import.meta.env.VITE_DISPATCH_BASE || 'https://cloud-api.oneal.arkturian.com/api/queue';

const DEFAULT_TIMEOUT_MS = 90_000;

export class AgentDispatchError extends Error {}

export class AgentDispatchService {
  /**
   * Send a query to an agent and resolve with the parsed JSON response.
   */
  static async query<T = unknown>(
    agent: string,
    text: string,
    opts: { userId?: string; timeoutMs?: number; baseUrl?: string } = {},
  ): Promise<T> {
    const baseUrl = opts.baseUrl || DEFAULT_DISPATCH_BASE;
    const userId = opts.userId || 'productfinder';
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const id = await this.postMessage(baseUrl, agent, text, userId);
    const rawResponse = await this.streamUntilDone(baseUrl, agent, id, timeoutMs);
    return parseAgentJson<T>(rawResponse);
  }

  private static async postMessage(
    baseUrl: string,
    agent: string,
    text: string,
    userId: string,
  ): Promise<number> {
    const url = `${baseUrl}/${encodeURIComponent(agent)}/message`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // raw_output asks cloud-api to skip the {type,content} wrapper so the
      // agent's reply hits us as plain JSON. Older cloud-api builds ignore
      // the flag — parseAgentJson handles both shapes.
      body: JSON.stringify({
        text,
        user_id: userId,
        reply_context: { raw_output: true },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AgentDispatchError(`Dispatch POST ${res.status}: ${body || res.statusText}`);
    }
    const { id } = (await res.json()) as { id?: number };
    if (typeof id !== 'number') {
      throw new AgentDispatchError('Dispatch did not return a numeric message id');
    }
    return id;
  }

  private static streamUntilDone(
    baseUrl: string,
    agent: string,
    id: number,
    timeoutMs: number,
  ): Promise<string> {
    const url = `${baseUrl}/${encodeURIComponent(agent)}/message/${id}/stream`;

    return new Promise((resolve, reject) => {
      const es = new EventSource(url);
      const timeout = setTimeout(() => {
        es.close();
        reject(new AgentDispatchError(`Dispatch timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      es.onmessage = (event) => {
        let payload: { status?: string; response?: string; message?: string };
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.status === 'done') {
          clearTimeout(timeout);
          es.close();
          resolve(payload.response ?? '');
        } else if (payload.status === 'error') {
          clearTimeout(timeout);
          es.close();
          reject(new AgentDispatchError(payload.message || 'Agent reported error'));
        }
      };

      es.onerror = () => {
        clearTimeout(timeout);
        es.close();
        reject(new AgentDispatchError('SSE connection failed'));
      };
    });
  }
}

/**
 * Parse an agent JSON payload defensively.
 *
 * Three shapes need to round-trip cleanly:
 *   1. Plain JSON          : `{"ids":[…],…}`               (raw_output honored)
 *   2. Cloud-api wrapper   : `{"type":"response","content":"…"}`
 *      where `content` may itself start with `json\n` or a ```json fence
 *   3. Tmux-noisy text     : prose / log lines around the JSON object
 *
 * We try each shape in order. Once Cloud strips the wrapper everywhere,
 * shape 1 will be the only path taken and the rest becomes dead-but-cheap
 * defense.
 */
function parseAgentJson<T>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new AgentDispatchError('Empty agent response');
  }

  // Shape 1: direct
  const direct = tryParseObject(raw);
  if (direct) {
    const inner = unwrapResponseEnvelope(direct);
    return inner as T;
  }

  // Shape 3: extract first balanced { … } and retry
  const block = extractFirstJsonObject(raw);
  if (block) {
    const parsed = tryParseObject(block);
    if (parsed) {
      const inner = unwrapResponseEnvelope(parsed);
      return inner as T;
    }
  }

  throw new AgentDispatchError('Agent response did not contain a JSON object');
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * If we got the cloud-api `{type:"response", content:"…"}` envelope,
 * strip it (and the leading `json\n` or markdown fence) and return the
 * inner object. Otherwise return as-is.
 */
function unwrapResponseEnvelope(obj: Record<string, unknown>): unknown {
  if (obj.type !== 'response' || typeof obj.content !== 'string') return obj;

  let content = obj.content.trim();

  // ```json … ``` fence
  const fence = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) content = fence[1].trim();
  // bare `json\n…` prefix
  else if (content.toLowerCase().startsWith('json\n')) content = content.slice(5).trim();

  const inner = tryParseObject(content);
  if (inner) return inner;

  const block = extractFirstJsonObject(content);
  if (block) {
    const parsed = tryParseObject(block);
    if (parsed) return parsed;
  }

  throw new AgentDispatchError('Agent response envelope had unparseable `content`');
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return null;
}
