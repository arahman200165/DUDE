import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_QUEUE_ERROR_MAX, HUB_QUEUE_PATH, HUB_QUEUE_STATES, HubQueueStatusResponse } from './queue.schema.js';

describe('HubQueueStatusResponse', () => {
  const zero = { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 0 };
  const empty = { available: false, counts: zero, kinds: [], oldestQueuedAt: null, recentFailures: [] };
  const failure = { id: 'abc', kind: 'blobs.verify', state: 'dead', attempts: 5, maxAttempts: 5, finishedAt: '2026-10-27T10:00:00.000Z', lastError: 'The worker crashed.' };

  it('names the path and the closed state list', () => {
    expect(HUB_QUEUE_PATH).toBe('/api/v1/queue');
    expect([...HUB_QUEUE_STATES]).toEqual(['queued', 'running', 'succeeded', 'failed', 'dead']);
  });

  it('accepts an unprovisioned, an idle and a busy queue', () => {
    expect(Value.Check(HubQueueStatusResponse, empty)).toBe(true);
    expect(Value.Check(HubQueueStatusResponse, { ...empty, available: true, kinds: [{ kind: 'noop.echo', ...zero, succeeded: 3 }] })).toBe(true);
    expect(Value.Check(HubQueueStatusResponse, { available: true, counts: { ...zero, queued: 2, dead: 1 }, kinds: [], oldestQueuedAt: '2026-10-27T09:00:00.000Z', recentFailures: [failure] })).toBe(true);
  });

  it('rejects a payload field, an open state, a negative count and an over-long error', () => {
    expect(Value.Check(HubQueueStatusResponse, { ...empty, recentFailures: [{ ...failure, state: 'queued' }] })).toBe(false);
    expect(Value.Check(HubQueueStatusResponse, { ...empty, counts: { ...zero, queued: -1 } })).toBe(false);
    expect(Value.Check(HubQueueStatusResponse, { ...empty, recentFailures: [{ ...failure, lastError: 'x'.repeat(HUB_QUEUE_ERROR_MAX + 1) }] })).toBe(false);
    expect(Value.Check(HubQueueStatusResponse, { ...empty, counts: { queued: 0 } })).toBe(false);
  });
});
