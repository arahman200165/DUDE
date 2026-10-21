import { describe, expect, it } from 'vitest';
import { generateUuids, inspectUuidRows, type UuidMobileOptions } from './uuid-mobile';
import { installEngineHost } from '@dude/crypto/host';

// The engines draw randomness and SubtleCrypto from the host; Node provides the same WebCrypto surface the Android host adapts.
installEngineHost({ crypto: () => globalThis.crypto } as unknown as Parameters<typeof installEngineHost>[0]);

const base: UuidMobileOptions = { version: 'v4', count: 1, namespaceChoice: 'DNS', customNamespace: '' };
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuids', () => {
  it('generates the requested number of v4 UUIDs, one per line', () => {
    const result = generateUuids('', { ...base, count: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = (result.output as string).split('\n');
      expect(lines).toHaveLength(3);
      for (const line of lines) expect(line).toMatch(V4);
    }
  });
  it('clamps the count to 1..100', () => {
    const many = generateUuids('', { ...base, count: 1000 });
    const none = generateUuids('', { ...base, count: 0 });
    expect(many.ok && (many.output as string).split('\n').length).toBe(100);
    expect(none.ok && (none.output as string).split('\n').length).toBe(1);
  });
  it('is deterministic and single-valued for name-based versions', () => {
    const first = generateUuids('example.com', { ...base, version: 'v5', count: 5 });
    expect(first).toEqual(generateUuids('example.com', { ...base, version: 'v5' }));
    expect(first.ok && (first.output as string).split('\n').length).toBe(1);
  });
  it('rejects v5 without a name or with an invalid custom namespace', () => {
    expect(generateUuids('', { ...base, version: 'v5' })).toEqual({ ok: false, error: 'Enter a name to hash.' });
    expect(generateUuids('x', { ...base, version: 'v3', namespaceChoice: 'custom', customNamespace: 'nope' })).toEqual({ ok: false, error: 'Enter a valid namespace UUID.' });
  });
});

describe('inspectUuidRows', () => {
  const rows = (input: string) => { const result = inspectUuidRows(input); return result.ok ? Object.fromEntries((result.output as readonly { key: string; value: string }[]).map(row => [row.key, row.value])) : null; };
  it('decodes the v1 timestamp of the RFC 9562 vector', () => {
    expect(rows('C232AB00-9414-11EC-B3C8-9F6BDECED846')).toEqual({ valid: 'yes', version: '1', variant: 'RFC 4122', timestamp: '2022-02-22T19:22:22.000Z' });
  });
  it('decodes the v6 timestamp of the RFC 9562 vector', () => {
    expect(rows('1EC9414C-232A-6B00-B3C8-9F6BDECED846')?.timestamp).toBe('2022-02-22T19:22:22.000Z');
  });
  it('has no timestamp row for v4', () => {
    expect(rows('550e8400-e29b-41d4-a716-446655440000')).toEqual({ valid: 'yes', version: '4', variant: 'RFC 4122' });
  });
  it('reports errors for empty and malformed input', () => {
    expect(inspectUuidRows('')).toEqual({ ok: false, error: 'Enter a UUID to inspect.' });
    expect(inspectUuidRows('not-a-uuid').ok).toBe(false);
  });
});
