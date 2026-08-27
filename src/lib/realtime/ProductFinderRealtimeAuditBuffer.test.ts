import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductFinderRealtimeAuditBuffer } from './ProductFinderRealtimeAuditBuffer';
import type { ProductFinderRealtimeEventBatch } from './ProductFinderRealtimeController';

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductFinderRealtimeAuditBuffer', () => {
  it('batches final transcripts and safe realtime telemetry with session-local sequence numbers', async () => {
    vi.useFakeTimers();
    const batches: unknown[] = [];
    const transport = {
      getSessionId: () => 'session-1',
      reportEvents: vi.fn(async batch => { batches.push(batch); }),
      sendEventsBeacon: vi.fn(() => true),
    };
    const audit = new ProductFinderRealtimeAuditBuffer(transport, {
      flushDelayMs: 2_000,
      now: () => Date.parse('2026-08-27T11:55:00.000Z'),
    });

    audit.recordTranscripts([
      { id: 'item-user', speaker: 'user', text: 'Ich suche einen Helm.', ts: 1 },
      { id: 'item-agent', speaker: 'bot', text: 'Für welchen Sport?', ts: 2 },
      { id: 'item-partial', speaker: 'user', text: 'Teil', partial: true, ts: 3 },
    ]);
    audit.recordLifecycle('realtime.ptt.commit.confirmed', {
      itemId: 'item-user',
      sessionId: 'must-not-leak',
    });
    audit.recordError('realtime.tool.failed', { code: 'invalid_tool_response' }, {
      name: 'find_products',
      selectionToken: 'must-not-leak',
    });
    audit.recordLifecycle('productfinder.selection.projected', { itemId: 'ignored' });
    audit.recordTranscripts([
      { id: 'item-user', speaker: 'user', text: 'Ich suche einen Helm.', ts: 1 },
    ]);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(batches).toEqual([{
      sessionId: 'session-1',
      events: [
        {
          seq: 1,
          ts: '1970-01-01T00:00:00.001Z',
          kind: 'transcript',
          payload: {
            itemId: 'item-user', speaker: 'user', text: 'Ich suche einen Helm.',
            source: 'asr', verified: false,
          },
        },
        {
          seq: 2,
          ts: '1970-01-01T00:00:00.002Z',
          kind: 'transcript',
          payload: {
            itemId: 'item-agent', speaker: 'agent', text: 'Für welchen Sport?',
            source: 'provider', verified: true,
          },
        },
        {
          seq: 3,
          ts: '2026-08-27T11:55:00.000Z',
          kind: 'lifecycle',
          payload: { name: 'realtime.ptt.commit.confirmed', itemId: 'item-user' },
        },
        {
          seq: 4,
          ts: '2026-08-27T11:55:00.000Z',
          kind: 'error',
          payload: {
            name: 'realtime.tool.failed',
            toolName: 'find_products',
            code: 'invalid_tool_response',
          },
        },
      ],
    }]);
  });

  it('keeps failed batches for retry and beacon-flushes them after session end', async () => {
    let sessionId: string | null = 'session-1';
    const beacons: unknown[] = [];
    const transport = {
      getSessionId: () => sessionId,
      reportEvents: vi.fn(async () => { throw new Error('offline'); }),
      sendEventsBeacon: vi.fn(batch => { beacons.push(batch); return true; }),
    };
    const audit = new ProductFinderRealtimeAuditBuffer(transport, { flushDelayMs: 60_000 });

    audit.recordLifecycle('realtime.ptt.commit.sent');
    await audit.flush();
    sessionId = null;
    audit.flushWithBeacon();

    expect(beacons).toHaveLength(1);
    expect(beacons[0]).toMatchObject({
      sessionId: 'session-1',
      events: [{ seq: 1, kind: 'lifecycle' }],
    });
  });

  it('keeps concurrent new events when an in-flight batch is also beaconed', async () => {
    let releaseReport: () => void = () => {};
    const reportBlocked = new Promise<void>(resolve => { releaseReport = resolve; });
    const beacons: ProductFinderRealtimeEventBatch[] = [];
    const transport = {
      getSessionId: () => 'session-1',
      reportEvents: vi.fn(async (_batch: ProductFinderRealtimeEventBatch) => reportBlocked),
      sendEventsBeacon: vi.fn((batch: ProductFinderRealtimeEventBatch) => {
        beacons.push(batch);
        return true;
      }),
    };
    const audit = new ProductFinderRealtimeAuditBuffer(transport, { flushDelayMs: 60_000 });
    audit.recordLifecycle('realtime.first');

    const flushing = audit.flush();
    audit.flushWithBeacon();
    audit.recordLifecycle('realtime.second');
    releaseReport();
    await flushing;
    audit.flushWithBeacon();

    expect(beacons.map(batch => batch.events.map(event => event.seq))).toEqual([[1]]);
    expect(transport.reportEvents.mock.calls.map(([batch]) => (
      batch.events.map((event: { seq: number }) => event.seq)
    ))).toEqual([[1], [2]]);
  });

  it('caps transcript text and splits requests below the backend byte limit', async () => {
    const batches: unknown[] = [];
    const transport = {
      getSessionId: () => 'session-1',
      reportEvents: vi.fn(async batch => { batches.push(batch); }),
      sendEventsBeacon: vi.fn(() => true),
    };
    const audit = new ProductFinderRealtimeAuditBuffer(transport, { flushDelayMs: 60_000 });
    audit.recordTranscripts(Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      speaker: 'user' as const,
      text: 'ä'.repeat(10_000),
      ts: index,
    })));

    await audit.flush();

    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches as Array<{ events: Array<{ payload: { text: string } }> }>) {
      expect(new TextEncoder().encode(JSON.stringify(batch)).byteLength).toBeLessThanOrEqual(64 * 1024);
      for (const event of batch.events) {
        expect(new TextEncoder().encode(event.payload.text).byteLength).toBeLessThanOrEqual(8 * 1024);
      }
    }
  });
});
