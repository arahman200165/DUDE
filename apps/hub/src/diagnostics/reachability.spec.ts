import { describe, expect, it } from 'vitest';
import { evaluateEcho, observedScope, readReachability, reachabilityVerified, recordReachability, REACHABILITY_FRESH_MS } from './reachability.js';
import { DatabaseSync } from 'node:sqlite';

const NOW = Date.parse('2026-10-03T00:00:00.000Z');
const base = { host: 'hub.example.com', names: ['hub.example.com'], viaProxy: false, now: NOW };

describe('evaluateEcho', () => {
  it('verifies a public address on a configured name', () => {
    const { response, record } = evaluateEcho({ ...base, ip: '203.0.113.9' });
    expect(record).toBe(true);
    expect(response).toMatchObject({ verified: true, hostMatchesConfiguredName: true, observed: { scope: 'public', viaProxy: false }, host: 'hub.example.com' });
    expect(JSON.stringify(response)).not.toContain('203.0.113.9');
  });

  it.each([
    ['10.0.0.5', 'private'], ['192.168.1.2', 'private'], ['100.64.1.1', 'cgnat'], ['127.0.0.1', 'loopback'], ['::1', 'loopback'],
    ['169.254.1.1', 'link-local'], ['fe80::1', 'link-local'], ['fd00::1', 'unique-local'], ['::ffff:10.1.1.1', 'private'], ['not-an-ip', 'unknown'],
  ])('does not verify %s (%s)', (ip, scope) => {
    const { response, record } = evaluateEcho({ ...base, ip });
    expect(record).toBe(false);
    expect(response.verified).toBe(false);
    expect(response.observed.scope).toBe(scope);
    expect(response.reason.length).toBeGreaterThan(10);
  });

  it('unwraps IPv4-mapped public IPv6 and accepts a port on the Host', () => {
    expect(evaluateEcho({ ...base, ip: '::ffff:203.0.113.9', host: 'Hub.Example.com:8443' }).record).toBe(true);
    expect(observedScope('::ffff:203.0.113.9')).toBe('public');
    expect(observedScope(undefined)).toBe('unknown');
    expect(observedScope('0.0.0.0')).toBe('unknown');
  });

  it('does not verify a public address on an unknown Host or an IP-literal Host', () => {
    const unknown = evaluateEcho({ ...base, ip: '203.0.113.9', host: 'other.example.net' });
    expect(unknown.record).toBe(false);
    expect(unknown.response.hostMatchesConfiguredName).toBe(false);
    expect(evaluateEcho({ ...base, ip: '203.0.113.9', host: '203.0.113.1:47821', names: ['203.0.113.1'] }).record).toBe(false);
    expect(evaluateEcho({ ...base, ip: '203.0.113.9', host: '[2001:db8::1]:47821', names: [] }).record).toBe(false);
  });

  it('proxy mode needs the public origin host', () => {
    const proxy = { ...base, viaProxy: true, publicOrigin: 'https://hub.example.com' };
    expect(evaluateEcho({ ...proxy, ip: '203.0.113.9' })).toMatchObject({ record: true, response: { observed: { viaProxy: true } } });
    expect(evaluateEcho({ ...proxy, ip: '203.0.113.9', host: 'alias.example.com', names: ['alias.example.com'] }).record).toBe(false);
    expect(evaluateEcho({ ...proxy, ip: '10.1.2.3' }).record).toBe(false);
  });
});

describe('reachability record', () => {
  it('stores the last record, ages it and gates on freshness', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    try {
      expect(readReachability(db, NOW)).toBeNull();
      expect(reachabilityVerified(db, NOW)).toBe(false);
      const { response } = evaluateEcho({ ...base, ip: '203.0.113.9' });
      expect(recordReachability(db, response, NOW)).toBe(true);
      expect(recordReachability(db, { ...response, at: new Date(NOW + 1000).toISOString() }, NOW + 1000)).toBe(false);
      expect(readReachability(db, NOW + 3600_000)).toMatchObject({ host: 'hub.example.com', ageMs: 3600_000 - 1000 });
      expect(reachabilityVerified(db, NOW + REACHABILITY_FRESH_MS)).toBe(true);
      expect(reachabilityVerified(db, NOW + REACHABILITY_FRESH_MS + 5000)).toBe(false);
    } finally { db.close(); }
  });
});
