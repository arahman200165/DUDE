import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { DEFAULT_HUB_TRUST_MODE, HUB_TRUST_MODES, HubTrustChange, isPublicCaDomain, sameTrust } from './trust.schema.js';

describe('trust modes', () => {
  it('is a closed list whose default is the pinned mode', () => {
    expect([...HUB_TRUST_MODES]).toEqual(['pinned', 'public-ca']);
    expect(DEFAULT_HUB_TRUST_MODE).toBe('pinned');
  });

  it('accepts only public DNS names for public-ca', () => {
    for (const ok of ['hub.example.com', 'a.b.co', 'my-hub.savesphere.app', 'xn--bcher-kva.example.org']) expect(isPublicCaDomain(ok)).toBe(true);
    for (const bad of ['', 'localhost', 'hub', '127.0.0.1', '10.0.0.1.', '[::1]', '::1', 'hub.local', 'hub.localhost', 'hub.internal', 'HUB.example.com',
      'hub.example.com.', 'hub.example.com:443', 'https://hub.example.com', 'hub..example.com', '-a.example.com', 'a.example.com/x', '1.2.3.4', '1.2.3.4.5']) {
      expect(isPublicCaDomain(bad), bad).toBe(false);
    }
  });

  it('compares trust by mode and domain', () => {
    expect(sameTrust({ mode: 'pinned', domain: null }, { mode: 'pinned', domain: null })).toBe(true);
    expect(sameTrust({ mode: 'public-ca', domain: 'a.example.com' }, { mode: 'public-ca', domain: 'a.example.com' })).toBe(true);
    expect(sameTrust({ mode: 'public-ca', domain: 'a.example.com' }, { mode: 'public-ca', domain: 'b.example.com' })).toBe(false);
    expect(sameTrust({ mode: 'pinned', domain: null }, { mode: 'public-ca', domain: 'a.example.com' })).toBe(false);
  });

  it('validates the explicit trust-change confirmation', () => {
    expect(Value.Check(HubTrustChange, { mode: 'public-ca', domain: 'hub.example.com' })).toBe(true);
    expect(Value.Check(HubTrustChange, { mode: 'pinned', domain: null })).toBe(true);
    expect(Value.Check(HubTrustChange, { mode: 'public-ca', domain: 'localhost' })).toBe(false);
    expect(Value.Check(HubTrustChange, { mode: 'public-ca', domain: 'hub.example.com', extra: 1 })).toBe(false);
  });
});
