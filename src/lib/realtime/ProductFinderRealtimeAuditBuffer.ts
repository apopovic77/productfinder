import type { TranscriptEntry } from '../../../libs/realtime-agent-web-core/dist/index.js';
import type {
  ProductFinderRealtimeBrowserEvent,
  ProductFinderRealtimeEventBatch,
} from './ProductFinderRealtimeController';

const DEFAULT_FLUSH_DELAY_MS = 2_000;
const MAX_EVENTS_PER_REQUEST = 100;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 8 * 1024;
const SAFE_CONTEXT_KEYS = new Set([
  'active', 'command', 'commandHandled', 'itemId', 'scope',
  'toolName', 'usageEventId',
]);

interface AuditTransport {
  getSessionId(): string | null;
  reportEvents(input: ProductFinderRealtimeEventBatch): Promise<unknown>;
  sendEventsBeacon(input: ProductFinderRealtimeEventBatch): boolean;
}

interface PendingEvent {
  sessionId: string;
  event: ProductFinderRealtimeBrowserEvent;
}

export interface ProductFinderRealtimeAuditBufferOptions {
  flushDelayMs?: number;
  now?: () => number;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(encoded.slice(0, maxBytes)).replace(/\uFFFD$/u, '');
}

function safeContext(
  context?: Readonly<Record<string, unknown>>,
  event?: string,
): Record<string, unknown> {
  if (!context) return {};
  const result = Object.fromEntries(
    Object.entries(context).filter(([key, value]) => (
      SAFE_CONTEXT_KEYS.has(key)
      && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    )),
  );
  if (event?.startsWith('realtime.tool.') && typeof context.name === 'string') {
    result.toolName = context.name;
  }
  return result;
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = (error as { code?: unknown }).code;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 200);
  }
  return error instanceof Error && error.name ? error.name.slice(0, 200) : 'unknown_error';
}

/**
 * Session-local, retryable browser audit queue.
 *
 * It intentionally accepts only transcript and `realtime.*` telemetry. Tool,
 * focus and usage events remain server-owned and cannot enter this queue.
 */
export class ProductFinderRealtimeAuditBuffer {
  private readonly transport: AuditTransport;
  private readonly flushDelayMs: number;
  private readonly now: () => number;
  private readonly nextSeqBySession = new Map<string, number>();
  private readonly transcriptFingerprintBySession = new Map<string, Map<string, string>>();
  private readonly pending: PendingEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor(transport: AuditTransport, options: ProductFinderRealtimeAuditBufferOptions = {}) {
    this.transport = transport;
    this.flushDelayMs = Math.max(0, options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS);
    this.now = options.now ?? Date.now;
  }

  recordTranscripts(entries: readonly TranscriptEntry[]): void {
    const sessionId = this.transport.getSessionId();
    if (!sessionId) return;
    const fingerprints = this.transcriptFingerprintBySession.get(sessionId) ?? new Map<string, string>();
    this.transcriptFingerprintBySession.set(sessionId, fingerprints);
    for (const entry of entries) {
      if (entry.partial || !entry.text.trim()) continue;
      const text = truncateUtf8(entry.text.trim(), MAX_TRANSCRIPT_BYTES);
      const fingerprint = `${entry.speaker}\u0000${text}`;
      if (fingerprints.get(entry.id) === fingerprint) continue;
      fingerprints.set(entry.id, fingerprint);
      this.enqueue(sessionId, 'transcript', {
        itemId: entry.id,
        speaker: entry.speaker === 'user' ? 'user' : 'agent',
        text,
        source: entry.speaker === 'user' ? 'asr' : 'provider',
        verified: entry.speaker !== 'user',
      }, entry.ts);
    }
  }

  recordLifecycle(event: string, context?: Readonly<Record<string, unknown>>): void {
    if (!event.startsWith('realtime.')) return;
    const sessionId = this.transport.getSessionId();
    if (!sessionId) return;
    this.enqueue(sessionId, 'lifecycle', { ...safeContext(context, event), name: event });
  }

  recordError(
    event: string,
    error: unknown,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    if (!event.startsWith('realtime.')) return;
    const sessionId = this.transport.getSessionId();
    if (!sessionId) return;
    this.enqueue(sessionId, 'error', {
      ...safeContext(context, event),
      name: event,
      code: safeErrorCode(error),
    });
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.clearTimer();
    this.flushPromise = this.flushPending().finally(() => {
      this.flushPromise = null;
      if (this.pending.length > 0) this.scheduleFlush();
    });
    return this.flushPromise;
  }

  flushWithBeacon(): void {
    this.clearTimer();
    while (this.pending.length > 0) {
      const batch = this.nextBatch();
      if (!batch || !this.transport.sendEventsBeacon(batch)) break;
      this.removeBatch(batch);
    }
    if (this.pending.length > 0) this.scheduleFlush();
  }

  dispose(): void {
    this.flushWithBeacon();
    this.clearTimer();
    if (this.pending.length > 0) void this.flush();
  }

  private enqueue(
    sessionId: string,
    kind: ProductFinderRealtimeBrowserEvent['kind'],
    payload: Readonly<Record<string, unknown>>,
    timestamp = this.now(),
  ): void {
    const seq = this.nextSeqBySession.get(sessionId) ?? 1;
    this.nextSeqBySession.set(sessionId, seq + 1);
    this.pending.push({
      sessionId,
      event: {
        seq,
        ts: new Date(timestamp).toISOString(),
        kind,
        payload,
      },
    });
    if (this.pending.length >= MAX_EVENTS_PER_REQUEST) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  private async flushPending(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.nextBatch();
      if (!batch) return;
      try {
        await this.transport.reportEvents(batch);
      } catch {
        return;
      }
      this.removeBatch(batch);
    }
  }

  private nextBatch(): ProductFinderRealtimeEventBatch | null {
    const first = this.pending[0];
    if (!first) return null;
    const events: ProductFinderRealtimeBrowserEvent[] = [];
    for (const candidate of this.pending) {
      if (candidate.sessionId !== first.sessionId || events.length >= MAX_EVENTS_PER_REQUEST) break;
      const nextEvents = [...events, candidate.event];
      if (events.length > 0 && byteLength({ sessionId: first.sessionId, events: nextEvents }) > MAX_REQUEST_BYTES) {
        break;
      }
      events.push(candidate.event);
    }
    return events.length > 0 ? { sessionId: first.sessionId, events } : null;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null || this.flushPromise) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDelayMs);
  }

  private removeBatch(batch: ProductFinderRealtimeEventBatch): void {
    const sequences = new Set(batch.events.map(event => event.seq));
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const candidate = this.pending[index];
      if (candidate?.sessionId === batch.sessionId && sequences.has(candidate.event.seq)) {
        this.pending.splice(index, 1);
      }
    }
  }

  private clearTimer(): void {
    if (this.flushTimer === null) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
