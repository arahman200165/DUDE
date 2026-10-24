import { describe, expect, it } from 'vitest';
import { fromBase64, isTransientRefusal, terminalReasonFor, toBase64, toCollabLinkControl } from './relay-transport.js';

describe('relay wire helpers', () => {
  it('round-trips base64 for every byte value and for a frame larger than one chunk, and rejects malformed text', () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    expect(fromBase64(toBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0));
    expect(fromBase64('***')).toBeNull();
    const large = new Uint8Array(1024 * 1024).map((_, i) => i % 251);
    expect(fromBase64(toBase64(large))).toEqual(large);
  });

  it('narrows Hub control messages to the three a subscription acts on', () => {
    expect(toCollabLinkControl({ type: 'subscribed', channel: 2, doc: 'room:a', extra: 1 })).toEqual({ type: 'subscribed', channel: 2, doc: 'room:a' });
    expect(toCollabLinkControl({ type: 'doc-error', channel: 1, code: 'forbidden', message: 'x' })).toEqual({ type: 'doc-error', channel: 1, code: 'forbidden' });
    expect(toCollabLinkControl({ type: 'error', code: 'rate-limited' })).toEqual({ type: 'error', code: 'rate-limited' });
    for (const bad of [{}, { type: 'welcome' }, { type: 'subscribed', channel: 0, doc: 'room:a' }, { type: 'subscribed', channel: 1.5, doc: 'room:a' }, { type: 'subscribed', channel: 1 }, { type: 'doc-error', channel: 1 }, { type: 'error' }]) {
      expect(toCollabLinkControl(bad)).toBeNull();
    }
  });

  it('maps the Agent reasons that end a hold, and knows the two that clear by themselves', () => {
    expect(terminalReasonFor('incompatible')).toBe('incompatible');
    expect(terminalReasonFor('authority-changed')).toBe('transferred');
    expect(terminalReasonFor('revoked')).toBe('session-expired');
    expect(terminalReasonFor('needs-reconcile')).toBe('unavailable');
    expect(terminalReasonFor(undefined)).toBe('unavailable');
    expect(isTransientRefusal('hub-offline')).toBe(true);
    expect(isTransientRefusal('first-sync-pending')).toBe(true);
    expect(isTransientRefusal('revoked')).toBe(false);
  });
});
