import { afterEach, describe, expect, it } from 'vitest';
import { backoffDelay, DEFAULT_BACKOFF, FAILED_RETENTION_MS, MAX_PAYLOAD_BYTES, SUCCEEDED_RETENTION_MS } from './job-queue.js';
import { openQueueFixture } from './queue-fixture.js';
import { redactJobError, JOB_ERROR_MAX } from './redact.js';

const open: Array<{ close(): void }> = [];
const fixture = (...args: Parameters<typeof openQueueFixture>) => { const f = openQueueFixture(...args); open.push(f); return f; };
afterEach(() => { for (const f of open.splice(0)) f.close(); });

describe('enqueue', () => {
  it('stores a queued job and refuses an unknown kind, a credential-looking payload key and an oversized payload', () => {
    const f = fixture();
    const { id, created } = f.queue.enqueue({ kind: 'noop.echo', payload: { a: 1 } });
    expect(created).toBe(true);
    expect(f.row(id)).toMatchObject({ kind: 'noop.echo', state: 'queued', attempts: 0, payload_json: '{"a":1}' });
    expect(() => f.queue.enqueue({ kind: 'extract.pdf' })).toThrow(/Unknown job kind/);
    expect(() => f.queue.enqueue({ kind: 'noop.echo', payload: { nested: { apiKey: 'x' } } })).toThrow(/credential/);
    expect(() => f.queue.enqueue({ kind: 'noop.echo', payload: { password: 'x' } })).toThrow(/credential/);
    expect(() => f.queue.enqueue({ kind: 'noop.echo', payload: { blob: 'x'.repeat(MAX_PAYLOAD_BYTES) } })).toThrow(/limited/);
    expect(() => f.queue.enqueue({ kind: 'noop.echo', idempotencyKey: '' })).toThrow();
  });

  it('is idempotent on the key while a job is queued or running, and runs again once it finished', () => {
    const f = fixture();
    const first = f.queue.enqueue({ kind: 'noop.echo', idempotencyKey: 'k' });
    const second = f.queue.enqueue({ kind: 'noop.echo', idempotencyKey: 'k' });
    expect(second).toEqual({ id: first.id, created: false });
    const claimed = f.queue.claim('w1')!;
    expect(f.queue.enqueue({ kind: 'noop.echo', idempotencyKey: 'k' })).toEqual({ id: first.id, created: false });
    expect(f.queue.complete(claimed.id, 'w1')).toBe(true);
    const third = f.queue.enqueue({ kind: 'noop.echo', idempotencyKey: 'k' });
    expect(third.created).toBe(true);
    expect(third.id).not.toBe(first.id);
  });
});

describe('claim', () => {
  it('leases the highest priority first, then the oldest run_after, and skips a job not yet due', () => {
    const f = fixture();
    const low = f.queue.enqueue({ kind: 'noop.echo', payload: { n: 'low' } }).id;
    f.advance(10);
    const high = f.queue.enqueue({ kind: 'noop.echo', payload: { n: 'high' }, priority: 5 }).id;
    const later = f.queue.enqueue({ kind: 'noop.echo', payload: { n: 'later' }, priority: 9, runAfter: f.now() + 60_000 }).id;
    const first = f.queue.claim('w1', { leaseMs: 1000 })!;
    expect(first).toMatchObject({ id: high, attempt: 1, payload: { n: 'high' }, leaseExpiresAt: f.now() + 1000 });
    expect(f.queue.claim('w1')!.id).toBe(low);
    expect(f.queue.claim('w1')).toBeUndefined();
    f.advance(60_000);
    expect(f.queue.claim('w1')!.id).toBe(later);
  });

  it('only claims the requested kinds', () => {
    const f = fixture();
    f.queue.enqueue({ kind: 'noop.echo' });
    expect(f.queue.claim('w', { kinds: ['blobs.verify'] })).toBeUndefined();
    expect(f.queue.claim('w', { kinds: [] })).toBeUndefined();
    expect(f.queue.claim('w', { kinds: ['noop.echo'] })).toBeDefined();
  });

  it('hands every job to exactly one of several claimers, across separate connections', () => {
    const f = fixture();
    const second = f.reopen();
    const third = f.reopen();
    try {
      const ids = Array.from({ length: 60 }, (_, i) => f.queue.enqueue({ kind: 'noop.echo', payload: { i } }).id);
      const claimers = [['a', f.queue], ['b', second.queue], ['c', third.queue]] as const;
      const got = new Map<string, string[]>();
      for (let round = 0; round < 40; round += 1) {
        for (const [name, queue] of claimers) {
          const job = queue.claim(name);
          if (job) got.set(job.id, [...(got.get(job.id) ?? []), name]);
        }
      }
      expect([...got.keys()].sort()).toEqual([...ids].sort());
      for (const owners of got.values()) expect(owners).toHaveLength(1);
      expect(new Set([...got.values()].flat()).size).toBe(3);
      expect(f.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE state = 'running' AND attempts = 1").get()).toEqual({ n: 60 });
    } finally {
      second.store.close();
      third.store.close();
    }
  });
});

describe('lease, heartbeat and completion', () => {
  it('lets only the holder heartbeat, complete or fail a job', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo' });
    f.queue.claim('w1', { leaseMs: 1000 });
    expect(f.queue.heartbeat(id, 'w2')).toBe(false);
    expect(f.queue.complete(id, 'w2')).toBe(false);
    expect(f.queue.fail(id, 'w2', 'x')).toBe('lost');
    f.advance(900);
    expect(f.queue.heartbeat(id, 'w1', 1000)).toBe(true);
    expect(f.row(id)).toMatchObject({ lease_expires_at: f.now() + 1000 });
    expect(f.queue.complete(id, 'w1', { summary: 'ok' })).toBe(true);
    expect(f.row(id)).toMatchObject({ state: 'succeeded', lease_owner: null, result_json: '{"summary":"ok"}' });
    expect(f.queue.complete(id, 'w1')).toBe(false);
  });

  it('returns a job whose lease expired to the queue after a backoff, and a stale holder can no longer finish it', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo' });
    f.queue.claim('crashed-worker', { leaseMs: 1000 });
    f.advance(999);
    expect(f.queue.recoverExpired()).toEqual({ requeued: 0, dead: 0 });
    f.advance(1);
    expect(f.queue.recoverExpired()).toEqual({ requeued: 1, dead: 0 });
    expect(f.row(id)).toMatchObject({ state: 'queued', attempts: 1, lease_owner: null, run_after: f.now() + DEFAULT_BACKOFF.baseMs });
    expect(String(f.row(id)['last_error'])).toContain('lease expired');
    expect(f.queue.complete(id, 'crashed-worker')).toBe(false);
    expect(f.queue.claim('w2')).toBeUndefined();
    f.advance(DEFAULT_BACKOFF.baseMs);
    expect(f.queue.claim('w2')).toMatchObject({ id, attempt: 2 });
  });

  it('dead-letters a job whose worker keeps dying once its attempts are used', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo', maxAttempts: 2 });
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      f.advance(DEFAULT_BACKOFF.maxMs);
      expect(f.queue.claim('w', { leaseMs: 10 })!.attempt).toBe(attempt);
      f.advance(10);
      f.queue.recoverExpired();
    }
    expect(f.row(id)).toMatchObject({ state: 'dead', attempts: 2 });
    expect(f.queue.claim('w')).toBeUndefined();
  });

  it('release gives a job back without costing an attempt', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo' });
    f.queue.claim('w1');
    expect(f.queue.release(id, 'other')).toBe(false);
    expect(f.queue.release(id, 'w1')).toBe(true);
    expect(f.row(id)).toMatchObject({ state: 'queued', attempts: 0 });
    expect(f.queue.claim('w2')).toMatchObject({ id, attempt: 1 });
  });
});

describe('failure, backoff and dead-letter', () => {
  it('backs off exponentially (capped), then goes dead after max_attempts', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo', maxAttempts: 3 });
    const delays: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      f.advance(DEFAULT_BACKOFF.maxMs);
      expect(f.queue.claim('w')!.attempt).toBe(attempt);
      const result = f.queue.fail(id, 'w', new Error('boom'));
      if (result === 'retried') delays.push(Number(f.row(id)['run_after']) - f.now());
      else expect(result).toBe('dead');
    }
    expect(delays).toEqual([5_000, 10_000]);
    expect(f.row(id)).toMatchObject({ state: 'dead', attempts: 3, last_error: 'boom' });
    expect(f.row(id)['finished_at']).not.toBeNull();
    expect([1, 2, 3, 8, 9, 40].map((n) => backoffDelay(DEFAULT_BACKOFF, n))).toEqual([5_000, 10_000, 20_000, 640_000, 900_000, 900_000]);
  });

  it('a retry is not claimable before its backoff has passed', () => {
    const f = fixture();
    f.queue.enqueue({ kind: 'noop.echo' });
    const job = f.queue.claim('w')!;
    expect(f.queue.fail(job.id, 'w', 'x')).toBe('retried');
    expect(f.queue.claim('w')).toBeUndefined();
    f.advance(4_999);
    expect(f.queue.claim('w')).toBeUndefined();
    f.advance(1);
    expect(f.queue.claim('w')).toBeDefined();
  });

  it('a non-retryable failure ends as failed with no retry', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo' });
    f.queue.claim('w');
    expect(f.queue.fail(id, 'w', 'bad payload', { retryable: false })).toBe('failed');
    expect(f.row(id)).toMatchObject({ state: 'failed', attempts: 1 });
    f.advance(DEFAULT_BACKOFF.maxMs);
    expect(f.queue.claim('w')).toBeUndefined();
  });

  it('redacts and truncates what it stores as last_error', () => {
    const f = fixture();
    const { id } = f.queue.enqueue({ kind: 'noop.echo' });
    f.queue.claim('w');
    f.queue.fail(id, 'w', new Error(`open C:\\Users\\ada\\secret\\file.txt failed; token=abc123 Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig ${'x'.repeat(500)}`));
    const stored = String(f.row(id)['last_error']);
    expect(stored.length).toBeLessThanOrEqual(JOB_ERROR_MAX);
    expect(stored).not.toMatch(/ada|abc123|eyJ/);
    expect(stored).toContain('<path>');
  });
});

describe('redactJobError', () => {
  it('removes paths, key=value secrets and long tokens, keeps the sentence', () => {
    expect(redactJobError(new Error('ENOENT: no such file /var/lib/dude/storage/blobs/aa/bb/cc'))).toBe('ENOENT: no such file <path>');
    expect(redactJobError('password: hunter2 rejected')).toBe('password=<redacted> rejected');
    expect(redactJobError(`digest ${'f'.repeat(64)} mismatch`)).toBe('digest <redacted> mismatch');
    expect(redactJobError(undefined)).toBe('The job failed.');
    expect(redactJobError('   ')).toBe('The job failed.');
  });
});

describe('prune and status', () => {
  it('prunes finished jobs past their retention and keeps recent and active ones', () => {
    const f = fixture();
    const done = f.queue.enqueue({ kind: 'noop.echo' }).id;
    f.queue.claim('w');
    f.queue.complete(done, 'w');
    const dead = f.queue.enqueue({ kind: 'noop.echo', maxAttempts: 1 }).id;
    f.queue.claim('w');
    f.queue.fail(dead, 'w', 'x');
    const waiting = f.queue.enqueue({ kind: 'noop.echo' }).id;
    f.advance(SUCCEEDED_RETENTION_MS + 1);
    expect(f.queue.prune()).toBe(1);
    expect(f.row(done)).toBeUndefined();
    expect(f.row(dead)).toBeDefined();
    f.advance(FAILED_RETENTION_MS);
    expect(f.queue.prune()).toBe(1);
    expect(f.row(waiting)).toBeDefined();
  });

  it('reports counts by state and kind, the oldest waiting job and recent failures without payloads', () => {
    const f = fixture();
    expect(f.queue.status()).toMatchObject({ available: true, counts: { queued: 0, running: 0, succeeded: 0, failed: 0, dead: 0 }, kinds: [], oldestQueuedAt: null, recentFailures: [] });
    const a = f.queue.enqueue({ kind: 'noop.echo', payload: { note: 'visible?' } }).id;
    f.queue.claim('w');
    f.queue.complete(a, 'w');
    const b = f.queue.enqueue({ kind: 'blobs.verify', maxAttempts: 1, payload: { limit: 3 } }).id;
    f.advance(1000);
    f.queue.enqueue({ kind: 'blobs.verify' });
    f.queue.claim('w', { kinds: ['blobs.verify'] });
    f.queue.fail(b, 'w', 'The worker crashed.');
    const status = f.queue.status();
    expect(status.counts).toEqual({ queued: 1, running: 0, succeeded: 1, failed: 0, dead: 1 });
    expect(status.kinds).toEqual([
      { kind: 'blobs.verify', queued: 1, running: 0, succeeded: 0, failed: 0, dead: 1 },
      { kind: 'noop.echo', queued: 0, running: 0, succeeded: 1, failed: 0, dead: 0 },
    ]);
    expect(status.oldestQueuedAt).toBe(new Date(f.now()).toISOString());
    expect(status.recentFailures).toEqual([{ id: b, kind: 'blobs.verify', state: 'dead', attempts: 1, maxAttempts: 1, finishedAt: new Date(f.now()).toISOString(), lastError: 'The worker crashed.' }]);
    expect(JSON.stringify(status)).not.toContain('visible?');
    expect(JSON.stringify(status)).not.toContain('limit');
  });
});
