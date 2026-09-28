import { afterEach, describe, expect, it } from 'vitest';
import { createSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { analyzeCaaSet, climbNames, parseCaaValue } from './network-caa';
import { runDnsLookup, runResolverComparison } from './network-dns-tools';

const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); });

function questionName(query: Buffer): { name: string; end: number; type: number } {
  const labels: string[] = [];
  let at = 12;
  while (query[at] !== 0) { labels.push(query.toString('latin1', at + 1, at + 1 + query[at])); at += query[at] + 1; }
  return { name: labels.join('.'), end: at + 5, type: query.readUInt16BE(at + 1) };
}

/** Fake zone: CAA only at example.test; everything else NOERROR/empty. */
async function zoneServer(zone: Record<string, Buffer[]>, address = '127.0.0.1'): Promise<number> {
  const server = createSocket('udp4');
  server.on('message', (query, sender) => {
    const { name, end, type } = questionName(query);
    const records = type === 257 ? zone[name] ?? [] : type === 1 ? [Buffer.from([192, 0, 2, name.length])] : [];
    const header = Buffer.alloc(12);
    query.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 4); header.writeUInt16BE(records.length, 6);
    const answers = records.map((rdata) => { const fixed = Buffer.alloc(10); fixed.writeUInt16BE(type, 0); fixed.writeUInt16BE(1, 2); fixed.writeUInt32BE(300, 4); fixed.writeUInt16BE(rdata.length, 8); return Buffer.concat([Buffer.from([0xc0, 0x0c]), fixed, rdata]); });
    server.send(Buffer.concat([header, query.subarray(12, end), ...answers]), sender.port, sender.address);
  });
  await new Promise<void>((resolve) => server.bind(0, address, resolve));
  closers.push(() => server.close());
  return (server.address() as AddressInfo).port;
}
const caa = (flags: number, tag: string, value: string) => Buffer.concat([Buffer.from([flags, tag.length]), Buffer.from(tag), Buffer.from(value)]);

describe('CAA (RFC 8659)', () => {
  it('climbs to the first non-empty CAA set and evaluates a CA', async () => {
    const port = await zoneServer({ 'example.test': [caa(0, 'issue', 'letsencrypt.org'), caa(0, 'issuewild', ';'), caa(0, 'iodef', 'mailto:sec@example.test')] });
    const result = await runDnsLookup({ kind: 'dns-lookup', target: 'www.api.example.test', recordType: 'CAA', resolver: `127.0.0.1:${port}`, caIdentifier: 'letsencrypt.org' }, new AbortController().signal) as { caa: ReturnType<typeof analyzeCaaSet> };
    expect(result.caa.relevantName).toBe('example.test');
    expect(result.caa.climbed.map((entry) => entry.name)).toEqual(['www.api.example.test', 'api.example.test', 'example.test']);
    expect(result.caa.caCheck).toEqual({ ca: 'letsencrypt.org', nonWildcard: true, wildcard: false });
    expect(result.caa.wildcardPolicy).toBe('none-allowed');
    expect(result.caa.iodef).toEqual(['mailto:sec@example.test']);
  });

  it('treats a critical unknown tag as blocking and an absent set as unrestricted', () => {
    const blocked = analyzeCaaSet('a.test', 'a.test', [{ name: 'a.test', type: 'CAA', ttl: 1, value: '128 tbs "x"' }], [], 'pki.goog');
    expect(blocked.blockedByCriticalUnknownTag).toBe(true);
    expect(blocked.caCheck?.nonWildcard).toBe(false);
    const open = analyzeCaaSet('a.test', null, [], [], 'pki.goog');
    expect(open.nonWildcardPolicy).toBe('unrestricted');
    expect(open.caCheck).toEqual({ ca: 'pki.goog', nonWildcard: true, wildcard: true });
    expect(parseCaaValue('0 issue "ca.example; account=123"')).toEqual({ critical: false, tag: 'issue', value: 'ca.example; account=123' });
    expect(climbNames('*.a.b.test')).toEqual(['a.b.test', 'b.test', 'test']);
  });
});

describe('Resolver Comparator', () => {
  it('compares custom resolvers with transport, TTL, and value differences', async () => {
    const first = await zoneServer({});
    const second = await zoneServer({});
    const progress: unknown[] = [];
    const result = await runResolverComparison({
      kind: 'dns-propagation', target: 'abc.test', recordType: 'A', includePresets: false,
      resolvers: [{ label: 'One', server: `127.0.0.1:${first}`, transport: 'classic' }, { label: 'Two', server: `127.0.0.1:${second}`, transport: 'classic' }],
    }, new AbortController().signal, (_done, _total, data) => progress.push(data)) as { results: { label: string }[]; comparison: { consistent: boolean } };
    expect(result.results.map((entry) => entry.label)).toEqual(['One', 'Two']);
    expect(result.comparison.consistent).toBe(true);
    expect(progress).toHaveLength(2);
  });

  it('refuses an empty resolver list', async () => {
    await expect(runResolverComparison({ kind: 'dns-propagation', target: 'x.test', includePresets: false }, new AbortController().signal, () => {})).rejects.toThrow(/at least one/);
  });
});
