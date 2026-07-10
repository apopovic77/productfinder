import { DISPATCH_BASE } from '../config/apiConfig';
/**
 * Dispatch a request to a cloud-api Claude agent via the queue API.
 *
 * Flow:
 *   POST /api/queue/{agent}/message       → { id }
 *   GET  /api/queue/{agent}/message/{id}/stream  (SSE)
 *     → { status: "processing" | "done" | "error", response?, message? }
 *
 * The agent's response is expected to be valid raw JSON. cloud-api honors
 * reply_context.raw_output since commits 18e1cbe/1c236bc/acb1863 (June 2026)
 * and extracts/normalizes the agent's JSON server-side. Any non-JSON reply
 * is treated as an error here — deliberately fail-loud instead of the old
 * silent repair heuristics (envelope unwrap, balanced-brace extraction,
 * digit-merge regex), which could corrupt legitimate content (issue #252).
 */

const DEFAULT_DISPATCH_BASE = DISPATCH_BASE;

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
      // agent's reply arrives as plain JSON.
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
 * Parse the agent's raw JSON reply.
 *
 * Fail-loud: if the backend ever regresses to the `{type:"response",...}`
 * envelope or delivers prose around the JSON, we surface a clear error
 * instead of silently repairing — repairs (digit-merge regex, balanced
 * extraction) proved riskier than the failures they masked (issue #252).
 */
function parseAgentJson<T>(raw: string): T {
  if (!raw || typeof raw !== 'string') {
    throw new AgentDispatchError('Empty agent response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const preview = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
    throw new AgentDispatchError(`Agent response is not valid JSON: ${preview}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AgentDispatchError('Agent response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.type === 'response' && typeof obj.content === 'string') {
    // cloud-api raw_output regression — the wrapper is back. Do not try to
    // repair (that path corrupted data before); make the regression visible.
    throw new AgentDispatchError(
      'Agent response arrived wrapped in {type:"response"} envelope — cloud-api raw_output regression?',
    );
  }

  return obj as T;
}
