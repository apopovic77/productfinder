import {
  APP_COMMAND_KEY,
  type RealtimeMintResult,
  type RealtimeToolCall,
} from '../../../libs/realtime-agent-web-core/dist/index.js';
import {
  REALTIME_SESSION_ENDPOINT,
  REALTIME_TOOL_ENDPOINT,
} from '../../config/apiConfig';
import type { ProductFinderEntryContext } from './ProductFinderRealtimeAdapter';
import type { ProductFinderRealtimeServerPort } from './ProductFinderRealtimeController';

const ALLOWED_TOOLS = new Set(['find_products', 'refine_search']);
const REQUIRED_TOOLS = ['find_products', 'refine_search'] as const;
const PRODUCT_RESULT_STATUSES = new Set(['matches', 'empty', 'unavailable']);
const FORBIDDEN_MODEL_RESULT_KEYS = ['selection_token', 'ids', 'name', 'description'] as const;

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProductFinderRealtimeBffClientOptions {
  sessionEndpoint?: string;
  toolEndpoint?: string;
  fetchImpl?: FetchPort;
}

interface JsonRecord {
  [key: string]: unknown;
}

export class ProductFinderRealtimeBffError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, detail: unknown) {
    super(code);
    this.name = 'ProductFinderRealtimeBffError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(source: JsonRecord, camel: string, snake: string): string | null {
  const value = source[camel] ?? source[snake];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseClientSecret(payload: JsonRecord): string | null {
  const direct = readString(payload, 'clientSecret', 'client_secret');
  if (direct) return direct;
  const nested = payload.client_secret;
  if (!isRecord(nested)) return null;
  return readString(nested, 'value', 'value');
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { error: 'invalid_json_response' };
  }
}

function errorCode(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const detail = isRecord(payload.detail) ? payload.detail : payload;
  const candidate = detail.error ?? detail.code;
  return typeof candidate === 'string' && candidate ? candidate : fallback;
}

function hasExactToolContract(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length !== REQUIRED_TOOLS.length) return false;
  const tools = new Set(value);
  return tools.size === REQUIRED_TOOLS.length
    && REQUIRED_TOOLS.every(tool => tools.has(tool));
}

function validateProductToolResult(payload: unknown): JsonRecord {
  if (!isRecord(payload)) {
    throw new ProductFinderRealtimeBffError(502, 'invalid_tool_response', payload);
  }

  // The Oneal BFF owns AiApi's HTTP transport envelope. Seeing it in the
  // browser is a contract violation even when `ok` is true: otherwise the
  // core misses the nested app command and the result surface stays empty.
  if ('ok' in payload || 'result' in payload || 'call_id' in payload || 'tool' in payload) {
    const code = payload.ok === false
      ? 'upstream_tool_failed'
      : 'transport_envelope_not_unwrapped';
    throw new ProductFinderRealtimeBffError(502, code, payload);
  }

  if (typeof payload.status !== 'string' || !PRODUCT_RESULT_STATUSES.has(payload.status)) {
    throw new ProductFinderRealtimeBffError(502, 'invalid_tool_response', payload);
  }
  if (FORBIDDEN_MODEL_RESULT_KEYS.some(key => key in payload)) {
    throw new ProductFinderRealtimeBffError(502, 'unsafe_tool_response', payload);
  }

  const rawCommand = payload[APP_COMMAND_KEY];
  if (payload.status !== 'matches') {
    if (rawCommand !== undefined) {
      throw new ProductFinderRealtimeBffError(502, 'unexpected_result_command', payload);
    }
    return payload;
  }

  if (!isRecord(rawCommand) || rawCommand.name !== 'show_product_results'
    || !isRecord(rawCommand.args)) {
    throw new ProductFinderRealtimeBffError(502, 'missing_result_command', payload);
  }
  const commandArgs = rawCommand.args;
  const selectionToken = commandArgs.selection_token;
  if (typeof selectionToken !== 'string' || !selectionToken.trim()
    || selectionToken.length > 512 || Object.keys(commandArgs).length !== 1) {
    throw new ProductFinderRealtimeBffError(502, 'invalid_result_command', payload);
  }
  return payload;
}

/**
 * Browser client for the productfinder-owned Realtime BFF.
 *
 * It never receives or forwards a principal JWT, host key, or internal key.
 * The browser authority is limited to the short-lived session identity minted
 * by the BFF and the two read-only tools advertised for that exact session.
 */
export class ProductFinderRealtimeBffClient implements ProductFinderRealtimeServerPort {
  private readonly sessionEndpoint: string;
  private readonly toolEndpoint: string;
  private readonly fetchImpl: FetchPort;
  private sessionId: string | null = null;

  constructor(options: ProductFinderRealtimeBffClientOptions = {}) {
    this.sessionEndpoint = options.sessionEndpoint ?? REALTIME_SESSION_ENDPOINT;
    this.toolEndpoint = options.toolEndpoint ?? REALTIME_TOOL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async mintSession(context: ProductFinderEntryContext): Promise<RealtimeMintResult> {
    this.sessionId = null;
    const response = await this.fetchImpl(this.sessionEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(context),
      credentials: 'same-origin',
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ProductFinderRealtimeBffError(
        response.status,
        errorCode(payload, `realtime_session_${response.status}`),
        payload,
      );
    }
    if (!isRecord(payload)) {
      throw new ProductFinderRealtimeBffError(502, 'invalid_session_response', payload);
    }
    const clientSecret = parseClientSecret(payload);
    const model = readString(payload, 'model', 'model');
    const sessionId = readString(payload, 'sessionId', 'session_id');
    const tools = payload.tools;
    const pushToTalk = payload.pushToTalk ?? payload.push_to_talk;
    const turnDetection = Object.prototype.hasOwnProperty.call(payload, 'turnDetection')
      ? payload.turnDetection
      : payload.turn_detection;
    if (!clientSecret || !model || !sessionId || !hasExactToolContract(tools)
      || pushToTalk !== true || turnDetection !== null) {
      throw new ProductFinderRealtimeBffError(502, 'invalid_session_response', payload);
    }
    this.sessionId = sessionId;
    return {
      clientSecret,
      model,
      sessionId,
      tools: Object.freeze([...tools]) as readonly string[],
      pushToTalk: true,
    };
  }

  async executeTool(call: RealtimeToolCall): Promise<unknown> {
    if (!ALLOWED_TOOLS.has(call.name)) {
      throw new ProductFinderRealtimeBffError(403, 'tool_not_allowed', { name: call.name });
    }
    if (!this.sessionId || call.sessionId !== this.sessionId) {
      throw new ProductFinderRealtimeBffError(403, 'realtime_session_mismatch', null);
    }
    const response = await this.fetchImpl(this.toolEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: call.name,
        args: call.args,
        callId: call.callId,
        sessionId: call.sessionId,
      }),
      credentials: 'same-origin',
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ProductFinderRealtimeBffError(
        response.status,
        errorCode(payload, `realtime_tool_${response.status}`),
        payload,
      );
    }
    // Return the complete *domain result*. The Oneal BFF must already have
    // removed AiApi's HTTP envelope; the shared browser core is the only
    // layer allowed to extract and execute `__app_command__` from this body.
    return validateProductToolResult(payload);
  }
}
