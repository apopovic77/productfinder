import {
  APP_COMMAND_KEY,
  type RealtimeMintResult,
  type RealtimeToolCall,
  type RealtimeUsageReport,
} from '../../../libs/realtime-agent-web-core/dist/index.js';
import {
  REALTIME_SESSION_END_ENDPOINT,
  REALTIME_SESSION_ENDPOINT,
  REALTIME_CONTEXT_ENDPOINT,
  REALTIME_EVENTS_ENDPOINT,
  REALTIME_TOOL_ENDPOINT,
  REALTIME_USAGE_ENDPOINT,
} from '../../config/apiConfig';
import type { ProductFinderEntryContext } from './ProductFinderRealtimeAdapter';
import type {
  ProductFinderRealtimeEventBatch,
  ProductFinderRealtimeServerPort,
  ProductFinderSelectedVariantContext,
} from './ProductFinderRealtimeController';

const ALLOWED_TOOLS = new Set(['find_products', 'refine_search', 'product_details']);
const REQUIRED_TOOLS = ['find_products', 'refine_search'] as const;
const PRODUCT_RESULT_STATUSES = new Set(['matches', 'empty', 'unavailable']);
const PRODUCT_DETAILS_STATUSES = new Set(['details', 'no_focus', 'no_such_position', 'unavailable']);
const APPLIED_SORT_VALUES = new Set(['default', 'newest', 'price_desc', 'price_asc']);
const FORBIDDEN_MODEL_RESULT_KEYS = ['selection_token', 'ids', 'name', 'description'] as const;
const PRODUCT_DETAIL_KEYS = new Set([
  'status', 'name', 'line', 'category_label', 'features', 'material',
  'sizes', 'colors', 'price_eur', 'target_group', 'selected',
]);
const PRODUCT_DETAIL_SELECTED_KEYS = new Set(['size', 'color', 'price_eur', 'available']);
const UNSAFE_DETAIL_TEXT = /(?:<[^>]+>|https?:\/\/|www\.|\[[^\]]+\]\([^)]+\))/i;

type FetchPort = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProductFinderRealtimeBffClientOptions {
  sessionEndpoint?: string;
  toolEndpoint?: string;
  contextEndpoint?: string;
  usageEndpoint?: string;
  eventsEndpoint?: string;
  sessionEndEndpoint?: string;
  fetchImpl?: FetchPort;
  sendBeaconImpl?: (url: string, data: Blob) => boolean;
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

function hasCompatibleToolContract(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const tools = new Set(value);
  return tools.size === value.length
    && tools.size >= REQUIRED_TOOLS.length
    && REQUIRED_TOOLS.every(tool => tools.has(tool))
    && [...tools].every(tool => typeof tool === 'string' && ALLOWED_TOOLS.has(tool));
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
  if (payload.hints !== undefined) {
    if (!isRecord(payload.hints)
      || (payload.hints.applied_sort !== undefined
        && (typeof payload.hints.applied_sort !== 'string'
          || !APPLIED_SORT_VALUES.has(payload.hints.applied_sort)))
      || (payload.hints.applied_limit !== undefined
        && (!Number.isSafeInteger(payload.hints.applied_limit)
          || Number(payload.hints.applied_limit) < 1
          || Number(payload.hints.applied_limit) > 50))) {
      throw new ProductFinderRealtimeBffError(502, 'invalid_tool_response', payload);
    }
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

function validateDetailString(value: unknown, maxLength: number): boolean {
  return value === null || value === undefined || (
    typeof value === 'string'
    && value.length <= maxLength
    && !UNSAFE_DETAIL_TEXT.test(value)
  );
}

function validateDetailList(value: unknown, maxItems: number): boolean {
  return value === null || value === undefined || (
    Array.isArray(value)
    && value.length <= maxItems
    && value.every(item => validateDetailString(item, 600))
  );
}

function validateSelectedVariantDetail(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!isRecord(value) || Object.keys(value).some(key => !PRODUCT_DETAIL_SELECTED_KEYS.has(key))) {
    return false;
  }
  return validateDetailString(value.size, 200)
    && validateDetailString(value.color, 200)
    && (value.price_eur === null || value.price_eur === undefined
      || (typeof value.price_eur === 'number'
        && Number.isFinite(value.price_eur)
        && value.price_eur >= 0))
    && (value.available === undefined || typeof value.available === 'boolean');
}

function validateProductDetailsResult(payload: unknown): JsonRecord {
  if (!isRecord(payload)
    || typeof payload.status !== 'string'
    || !PRODUCT_DETAILS_STATUSES.has(payload.status)
    || Object.keys(payload).some(key => !PRODUCT_DETAIL_KEYS.has(key))) {
    throw new ProductFinderRealtimeBffError(502, 'invalid_tool_response', payload);
  }
  if (!validateDetailString(payload.name, 300)
    || !validateDetailString(payload.line, 200)
    || !validateDetailString(payload.category_label, 200)
    || !validateDetailList(payload.features, 20)
    || !validateDetailString(payload.material, 600)
    || !validateDetailList(payload.sizes, 200)
    || !validateDetailList(payload.colors, 200)
    || !validateDetailString(payload.target_group, 100)
    || !validateSelectedVariantDetail(payload.selected)
    || !(payload.price_eur === null || payload.price_eur === undefined
      || (Array.isArray(payload.price_eur)
        && payload.price_eur.length === 2
        && payload.price_eur.every(value => typeof value === 'number' && Number.isFinite(value))))) {
    throw new ProductFinderRealtimeBffError(502, 'unsafe_tool_response', payload);
  }
  return payload;
}


function normalizeSelectedVariantContext(
  value: ProductFinderSelectedVariantContext | null,
): ProductFinderSelectedVariantContext | null {
  if (value === null) return null;
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'size' && key !== 'color')) {
    throw new ProductFinderRealtimeBffError(422, 'invalid_selected_variant', null);
  }
  const normalize = (candidate: unknown): string | undefined => {
    if (candidate === undefined) return undefined;
    if (typeof candidate !== 'string') {
      throw new ProductFinderRealtimeBffError(422, 'invalid_selected_variant', null);
    }
    const normalized = candidate.trim();
    if (!normalized || normalized.length > 200 || UNSAFE_DETAIL_TEXT.test(normalized)) {
      throw new ProductFinderRealtimeBffError(422, 'invalid_selected_variant', null);
    }
    return normalized;
  };
  const size = normalize(value.size);
  const color = normalize(value.color);
  if (!size && !color) return null;
  return Object.freeze({ ...(size ? { size } : {}), ...(color ? { color } : {}) });
}

/**
 * Browser client for the productfinder-owned Realtime BFF.
 *
 * It never receives or forwards a principal JWT, host key, or internal key.
 * The browser authority is limited to the short-lived session identity minted
 * by the BFF and the read-only tools advertised for that exact session.
 */
export class ProductFinderRealtimeBffClient implements ProductFinderRealtimeServerPort {
  private readonly sessionEndpoint: string;
  private readonly toolEndpoint: string;
  private readonly contextEndpoint: string;
  private readonly usageEndpoint: string;
  private readonly eventsEndpoint: string;
  private readonly sessionEndEndpoint: string;
  private readonly fetchImpl: FetchPort;
  private readonly sendBeaconImpl: ((url: string, data: Blob) => boolean) | null;
  private sessionId: string | null = null;
  private readonly knownSessionIds = new Set<string>();
  private desiredFocusedProductId: number | null = null;
  private desiredSelectedVariant: ProductFinderSelectedVariantContext | null = null;
  private hasFocusedProductContext = false;
  private contextQueue: Promise<void> = Promise.resolve();

  constructor(options: ProductFinderRealtimeBffClientOptions = {}) {
    this.sessionEndpoint = options.sessionEndpoint ?? REALTIME_SESSION_ENDPOINT;
    this.toolEndpoint = options.toolEndpoint ?? REALTIME_TOOL_ENDPOINT;
    this.contextEndpoint = options.contextEndpoint ?? REALTIME_CONTEXT_ENDPOINT;
    this.usageEndpoint = options.usageEndpoint ?? REALTIME_USAGE_ENDPOINT;
    this.eventsEndpoint = options.eventsEndpoint ?? REALTIME_EVENTS_ENDPOINT;
    this.sessionEndEndpoint = options.sessionEndEndpoint ?? REALTIME_SESSION_END_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.sendBeaconImpl = options.sendBeaconImpl
      ?? (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon.bind(navigator)
        : null);
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
    if (!clientSecret || !model || !sessionId || !hasCompatibleToolContract(tools)
      || pushToTalk !== true || turnDetection !== null) {
      throw new ProductFinderRealtimeBffError(502, 'invalid_session_response', payload);
    }
    this.sessionId = sessionId;
    this.knownSessionIds.add(sessionId);
    if (this.hasFocusedProductContext) {
      try {
        await this.queueContextSync(sessionId);
      } catch (error) {
        await this.endSession({ sessionId }).catch(() => undefined);
        throw error;
      }
    }
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
    return call.name === 'product_details'
      ? validateProductDetailsResult(payload)
      : validateProductToolResult(payload);
  }

  async updateProductContext(
    focusedProductId: number | null,
    selectedVariant: ProductFinderSelectedVariantContext | null,
  ): Promise<void> {
    if (focusedProductId !== null
      && (!Number.isSafeInteger(focusedProductId) || focusedProductId < 1)) {
      throw new ProductFinderRealtimeBffError(422, 'invalid_focused_product_id', null);
    }
    this.desiredFocusedProductId = focusedProductId;
    this.desiredSelectedVariant = focusedProductId === null
      ? null
      : normalizeSelectedVariantContext(selectedVariant);
    this.hasFocusedProductContext = true;
    if (!this.sessionId) return;
    await this.queueContextSync(this.sessionId);
  }

  async reportUsage(report: RealtimeUsageReport): Promise<unknown> {
    this.assertCurrentSession(report.sessionId);
    const response = await this.fetchImpl(this.usageEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: report.sessionId,
        usageEventId: report.usageEventId,
        audio_input_tokens: report.audioInputTokens,
        audio_output_tokens: report.audioOutputTokens,
        text_input_tokens: report.textInputTokens,
        text_output_tokens: report.textOutputTokens,
        cached_text_input_tokens: report.cachedTextInputTokens,
        cached_audio_input_tokens: report.cachedAudioInputTokens,
        duration_sec: report.durationSec,
      }),
      credentials: 'same-origin',
      keepalive: true,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ProductFinderRealtimeBffError(
        response.status,
        errorCode(payload, `realtime_usage_${response.status}`),
        payload,
      );
    }
    return payload;
  }

  async reportEvents(input: ProductFinderRealtimeEventBatch): Promise<unknown> {
    this.assertKnownSession(input.sessionId);
    const response = await this.fetchImpl(this.eventsEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'same-origin',
      keepalive: true,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ProductFinderRealtimeBffError(
        response.status,
        errorCode(payload, `realtime_events_${response.status}`),
        payload,
      );
    }
    if (!isRecord(payload)
      || typeof payload.accepted !== 'number'
      || typeof payload.deduped !== 'number') {
      throw new ProductFinderRealtimeBffError(502, 'invalid_events_response', payload);
    }
    return payload;
  }

  sendEventsBeacon(input: ProductFinderRealtimeEventBatch): boolean {
    this.assertKnownSession(input.sessionId);
    if (!this.sendBeaconImpl) return false;
    return this.sendBeaconImpl(
      this.eventsEndpoint,
      new Blob([JSON.stringify(input)], { type: 'application/json' }),
    );
  }

  async endSession(input: Readonly<{ sessionId: string }>): Promise<unknown> {
    this.assertCurrentSession(input.sessionId);
    // The local authority ends synchronously. A subsequent open must not be
    // cleared by the completion of this idempotent network release.
    this.sessionId = null;
    const response = await this.fetchImpl(this.sessionEndEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: input.sessionId }),
      credentials: 'same-origin',
      keepalive: true,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new ProductFinderRealtimeBffError(
        response.status,
        errorCode(payload, `realtime_session_end_${response.status}`),
        payload,
      );
    }
    return payload;
  }

  private assertCurrentSession(sessionId: string): void {
    if (!this.sessionId || sessionId !== this.sessionId) {
      throw new ProductFinderRealtimeBffError(403, 'realtime_session_mismatch', null);
    }
  }

  private assertKnownSession(sessionId: string): void {
    if (!this.knownSessionIds.has(sessionId)) {
      throw new ProductFinderRealtimeBffError(403, 'realtime_session_mismatch', null);
    }
  }

  private queueContextSync(sessionId: string): Promise<void> {
    const request = this.contextQueue.then(async () => {
      if (this.sessionId !== sessionId) return;
      const response = await this.fetchImpl(this.contextEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          focusedProductId: this.desiredFocusedProductId,
          selectedVariant: this.desiredSelectedVariant,
        }),
        credentials: 'same-origin',
      });
      const payload = await readJson(response);
      if (!response.ok || !isRecord(payload) || typeof payload.focused !== 'boolean') {
        throw new ProductFinderRealtimeBffError(
          response.ok ? 502 : response.status,
          errorCode(payload, response.ok ? 'invalid_context_response' : `realtime_context_${response.status}`),
          payload,
        );
      }
    });
    this.contextQueue = request.catch(() => undefined);
    return request;
  }
}
