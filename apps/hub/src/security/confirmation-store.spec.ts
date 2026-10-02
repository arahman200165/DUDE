import { describe, expect, it } from 'vitest';
import { CONFIRMATION_TTL_MS, ConfirmationStore } from './confirmation-store.js';

const base = { action: 'purge', digest: 'abc', bindingId: 'session-1', now: 1_000 };

describe('ConfirmationStore', () => {
  it('issues a 32-byte base64url token that is valid once', () => {
    const store = new ConfirmationStore();
    const token = store.issue(base);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.consume({ ...base, token })).toBe(true);
    expect(store.consume({ ...base, token })).toBe(false);
  });

  it('expires after 60 seconds', () => {
    const store = new ConfirmationStore();
    const token = store.issue(base);
    expect(store.consume({ ...base, token, now: base.now + CONFIRMATION_TTL_MS + 1 })).toBe(false);
    const edge = store.issue(base);
    expect(store.consume({ ...base, token: edge, now: base.now + CONFIRMATION_TTL_MS })).toBe(true);
  });

  it('requires action, digest and binding to match, and burns the token on a failed attempt', () => {
    for (const change of [{ action: 'owner-reset' }, { digest: 'zzz' }, { bindingId: 'session-2' }]) {
      const store = new ConfirmationStore();
      const token = store.issue(base);
      expect(store.consume({ ...base, ...change, token })).toBe(false);
      expect(store.consume({ ...base, token })).toBe(false);
    }
  });

  it('rejects unknown and empty tokens, and keeps only hashes', () => {
    const store = new ConfirmationStore();
    const token = store.issue(base);
    expect(store.consume({ ...base, token: 'nope' })).toBe(false);
    expect(store.consume({ ...base, token: '' })).toBe(false);
    expect(JSON.stringify([...(store as unknown as { staged: Map<string, unknown> }).staged.keys()])).not.toContain(token);
  });

  it('sweeps expired entries when issuing', () => {
    const store = new ConfirmationStore();
    store.issue(base);
    store.issue({ ...base, now: base.now + CONFIRMATION_TTL_MS + 10 });
    expect(store.pending).toBe(1);
  });
});
