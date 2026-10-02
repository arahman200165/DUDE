import { afterEach, describe, expect, it } from 'vitest';
import { createSocket } from 'node:dgram';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import { createServer as createTlsServer } from 'node:tls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareDnsResults, decodeMessage, encodeName, encodeQuery, queryDns, setDnsTlsCaForTesting, TYPE_CODES, base32hex, parseServerAddress } from './network-dns';
import { validateResolver } from './network-validation';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');

/** Minimal authoritative responder: echoes the question and appends `records` (owner = question name). */
function respond(query: Buffer, records: readonly { type: number; rdata: Buffer; ttl?: number }[], flags = 0x8180): Buffer {
  let at = 12;
  while (query[at] !== 0) at += query[at] + 1;
  const question = query.subarray(12, at + 5);
  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2);
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(records.length, 6);
  const answers = records.map(({ type, rdata, ttl = 60 }) => {
    const fixed = Buffer.alloc(10);
    fixed.writeUInt16BE(type, 0); fixed.writeUInt16BE(1, 2); fixed.writeUInt32BE(ttl, 4); fixed.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([Buffer.from([0xc0, 0x0c]), fixed, rdata]);
  });
  return Buffer.concat([header, question, ...answers]);
}

const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); setDnsTlsCaForTesting(undefined); });

async function udpServer(handler: (query: Buffer) => Buffer): Promise<number> {
  const server = createSocket('udp4');
  server.on('message', (query, sender) => server.send(handler(query), sender.port, sender.address));
  await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return (server.address() as AddressInfo).port;
}

describe('DNS wire client', () => {
  it('queries a classic resolver over UDP with EDNS0 and reports flags, TTLs, and the contacted server', async () => {
    let sawOpt = false;
    const port = await udpServer((query) => {
      sawOpt = query.readUInt16BE(10) === 1;
      return respond(query, [{ type: 1, rdata: Buffer.from([192, 0, 2, 9]), ttl: 300 }], 0x81a0);
    });
    const result = await queryDns({ kind: 'dns-lookup', target: 'example.test', recordType: 'A', resolver: `127.0.0.1:${port}` }, new AbortController().signal);
    expect(sawOpt).toBe(true);
    expect(result.answers[0]).toMatchObject({ value: '192.0.2.9', ttl: 300, type: 'A' });
    expect(result.flags.ad).toBe(true);
    expect(result.rcodeName).toBe('NOERROR');
    expect(result.diagnostics.contacted).toBe(`127.0.0.1:${port}`);
  });

  it('sets the DO and CD bits only when asked', () => {
    const plain = encodeQuery('example.test', 1, 1);
    const secure = encodeQuery('example.test', 1, 1, { dnssecOk: true, checkingDisabled: true });
    expect(plain.readUInt16BE(2) & 0x10).toBe(0);
    expect(secure.readUInt16BE(2) & 0x10).toBe(0x10);
    expect(plain.readUInt16BE(plain.length - 4)).toBe(0);
    expect(secure.readUInt16BE(secure.length - 4)).toBe(0x8000);
    expect(encodeName('.')).toEqual(Buffer.from([0]));
  });

  it('retries over TCP when the UDP answer is truncated', async () => {
    const tcp = createTcpServer((socket) => {
      socket.once('data', (framed: Buffer) => {
        const query = framed.subarray(2, 2 + framed.readUInt16BE(0));
        const answer = respond(query, [{ type: 16, rdata: Buffer.concat([Buffer.from([5]), Buffer.from('hello')]) }]);
        const length = Buffer.alloc(2); length.writeUInt16BE(answer.length);
        socket.end(Buffer.concat([length, answer]));
      });
    });
    await new Promise<void>((resolve) => tcp.listen(0, '127.0.0.1', resolve));
    closers.push(() => tcp.close());
    const port = (tcp.address() as AddressInfo).port;
    const udp = createSocket('udp4');
    udp.on('message', (query, sender) => udp.send(respond(query, [], 0x8380), sender.port, sender.address));
    await new Promise<void>((resolve) => udp.bind(port, '127.0.0.1', resolve));
    closers.push(() => udp.close());
    const result = await queryDns({ kind: 'dns-lookup', target: 'big.test', recordType: 'TXT', resolver: `127.0.0.1:${port}` }, new AbortController().signal);
    expect(result.diagnostics.retriedOverTcp).toBe(true);
    expect(result.answers[0].value).toBe('hello');
  });

  it('speaks DNS over TLS with strict certificate checking', async () => {
    const server = createTlsServer({ key: fixture('leaf-key.pem'), cert: `${fixture('leaf.pem')}${fixture('int.pem')}` }, (socket) => {
      socket.once('data', (framed: Buffer) => {
        const query = framed.subarray(2, 2 + framed.readUInt16BE(0));
        const answer = respond(query, [{ type: 28, rdata: Buffer.from('20010db8000000000000000000000001', 'hex') }]);
        const length = Buffer.alloc(2); length.writeUInt16BE(answer.length);
        socket.end(Buffer.concat([length, answer]));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => server.close());
    const port = (server.address() as AddressInfo).port;
    await expect(queryDns({ kind: 'dns-lookup', target: 'v6.test', recordType: 'AAAA', resolverTransport: 'dot', resolver: `localhost:${port}` }, new AbortController().signal)).rejects.toThrow();
    setDnsTlsCaForTesting(fixture('root.pem'));
    const result = await queryDns({ kind: 'dns-lookup', target: 'v6.test', recordType: 'AAAA', resolverTransport: 'dot', resolver: `localhost:${port}` }, new AbortController().signal);
    expect(result.answers[0].value).toBe('2001:db8::1');
    expect(result.diagnostics.tls?.authorized).toBe(true);
    expect(result.diagnostics.tls?.protocol).toMatch(/TLSv1\.[23]/);
  });

  it('decodes the Phase 28 record types', async () => {
    const caa = Buffer.concat([Buffer.from([0, 5]), Buffer.from('issueletsencrypt.org')]);
    const ds = Buffer.from('4f660802e06d44b0', 'hex');
    const dnskey = Buffer.concat([Buffer.from([1, 1, 3, 13]), Buffer.from('abcd', 'hex')]);
    const tlsa = Buffer.from('030101aabb', 'hex');
    const svcb = Buffer.concat([Buffer.from([0, 1, 0]), Buffer.from([0, 1, 0, 6, 2]), Buffer.from('h2'), Buffer.from([2]), Buffer.from('h3'), Buffer.from([0, 3, 0, 2, 0x01, 0xbb])]);
    const soa = Buffer.concat([encodeName('ns1.example.test'), encodeName('hostmaster.example.test'), Buffer.from('0000000100000e1000000384000927c000000e10', 'hex')]);
    const nsec = Buffer.concat([encodeName('b.example.test'), Buffer.from([0, 6, 0x40, 0x01, 0, 0, 0, 0x03])]);
    const port = await udpServer((query) => {
      let at = 12; while (query[at] !== 0) at += query[at] + 1;
      const type = query.readUInt16BE(at + 1);
      const rdata = ({ 257: caa, 43: ds, 48: dnskey, 52: tlsa, 65: svcb, 6: soa, 47: nsec } as Record<number, Buffer>)[type];
      return respond(query, [{ type, rdata }]);
    });
    const run = (recordType: keyof typeof TYPE_CODES) => queryDns({ kind: 'dns-lookup', target: 'example.test', recordType, resolver: `127.0.0.1:${port}` }, new AbortController().signal).then((result) => result.answers[0].value);
    expect(await run('CAA')).toBe('0 issue "letsencrypt.org"');
    expect(await run('DS')).toBe('20326 8 2 E06D44B0');
    expect(await run('DNSKEY')).toBe('257 3 13 q80=');
    expect(await run('TLSA')).toBe('3 1 1 AABB');
    expect(await run('HTTPS')).toBe('1 . alpn=h2,h3 port=443');
    expect(await run('SOA')).toBe('ns1.example.test. hostmaster.example.test. 1 3600 900 600000 3600');
    expect(await run('NSEC')).toBe('b.example.test. A MX RRSIG NSEC');
  });

  it('rejects malformed and mismatched responses', () => {
    expect(() => decodeMessage(Buffer.alloc(4))).toThrow(/size/);
    const response = respond(encodeQuery('a.test', 1, 7, { edns: false }), []);
    expect(() => decodeMessage(response, 8)).toThrow(/Mismatched/);
    const loop = Buffer.concat([response.subarray(0, 12), Buffer.from([0xc0, 0x0c, 0, 1, 0, 1])]);
    expect(() => decodeMessage(loop)).toThrow(/loop/);
  });

  it('encodes NSEC3 hashes as base32hex and parses resolver addresses', () => {
    expect(base32hex(Buffer.from('f', 'latin1'))).toBe('CO');
    expect(parseServerAddress('[2001:db8::1]:5353', 53)).toEqual({ host: '2001:db8::1', port: 5353 });
    expect(parseServerAddress('2001:db8::1', 53)).toEqual({ host: '2001:db8::1', port: 53 });
    expect(parseServerAddress('9.9.9.9', 53)).toEqual({ host: '9.9.9.9', port: 53 });
  });
});

describe('resolver validation (previously unvalidated for DNS kinds)', () => {
  it('accepts only well-formed servers per transport', () => {
    expect(validateResolver('1.1.1.1:53', 'classic')).toBe('1.1.1.1:53');
    expect(validateResolver('system', 'classic')).toBe('system');
    expect(() => validateResolver('dns.google', 'classic')).toThrow(/IP addresses/);
    expect(() => validateResolver('http://dns.google/dns-query', 'doh')).toThrow(/https/);
    expect(() => validateResolver('https://user:pw@dns.google/dns-query', 'doh')).toThrow(/credentials/);
    expect(validateResolver('dns.quad9.net:853', 'dot')).toBe('dns.quad9.net:853');
    expect(() => validateResolver('dns quad9', 'dot')).toThrow();
  });
});

describe('resolver comparison', () => {
  it('normalizes values and reports TTL spread and resolver-only values', () => {
    const result = compareDnsResults([
      { label: 'first', rcode: 0, answers: [{ name: 'example.test', type: 'A', value: '192.0.2.9', ttl: 60 }] },
      { label: 'second', rcode: 0, answers: [{ name: 'example.test', type: 'A', value: '192.0.2.9', ttl: 1 }] },
    ]);
    expect(result.consistent).toBe(true);
    expect(result.ttlSpread).toBe(59);
    const divergent = compareDnsResults([
      { label: 'a', rcode: 0, answers: [{ name: '', type: 'A', value: '192.0.2.9', ttl: 0 }] },
      { label: 'b', rcode: 0, answers: [{ name: '', type: 'A', value: '192.0.2.10', ttl: 0 }] },
      { label: 'failed', error: 'timeout' },
    ]);
    expect(divergent.consistent).toBe(false);
    expect(divergent.onlyIn.map((entry) => entry.label)).toEqual(['a', 'b']);
  });
});
