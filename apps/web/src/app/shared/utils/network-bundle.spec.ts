import { strFromU8, unzipSync } from 'fflate';
import { buildNetworkBundle } from './network-bundle';

describe('network bundle export', () => {
  const run = {
    id: 'run-1', createdAt: '2026-09-27T12:00:00.000Z',
    request: { kind: 'connectivity-tester' as const, target: 'https://example.test', method: 'POST', headers: { Authorization: 'Bearer secret' }, body: 'private body' },
    result: { status: 200, headers: { 'set-cookie': 'session=private', 'content-type': 'text/plain' }, bodyBase64: 'b2s=' },
  };
  it('contains manifest, Markdown and scrubbed JSON by default', () => {
    const files = unzipSync(buildNetworkBundle([run], () => 'b2s=', false));
    expect(Object.keys(files).sort()).toEqual(['manifest.json', 'results.json', 'summary.md']);
    const json = strFromU8(files['results.json']);
    expect(json).toContain('connectivity-tester');
    expect(json).not.toContain('Bearer secret');
    expect(json).not.toContain('private body');
    expect(json).not.toContain('bodyBase64');
    expect(json).not.toContain('session=private');
  });
  it('includes response bytes only when explicitly selected', () => {
    const files = unzipSync(buildNetworkBundle([run], () => 'b2s=', true));
    expect(strFromU8(files['responses/run-1.bin'])).toBe('ok');
  });
});
