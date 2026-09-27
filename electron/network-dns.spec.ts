import { describe, expect, it } from 'vitest';
import { createSocket } from 'node:dgram';
import { compareDnsResults, queryDns } from './network-dns';

describe('DNS diagnostics', () => {
  it('queries a local classic resolver without changing process-global DNS', async () => {
    const server = createSocket('udp4');
    server.on('message', (query, sender) => {
      const question = query.subarray(12);
      const header = Buffer.alloc(12);
      query.copy(header, 0, 0, 2);
      header.writeUInt16BE(0x8180, 2);
      header.writeUInt16BE(1, 4);
      header.writeUInt16BE(1, 6);
      const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 192, 0, 2, 9]);
      server.send(Buffer.concat([header, question, answer]), sender.port, sender.address);
    });
    await new Promise<void>((resolve) => server.bind(0, '127.0.0.1', resolve));
    try {
      const port = (server.address() as { port: number }).port;
      const result = await queryDns({ kind: 'dns-lookup', target: 'example.test', recordType: 'A', resolver: `127.0.0.1:${port}` }, new AbortController().signal);
      expect(result.answers[0].value).toBe('192.0.2.9');
      expect(result.server).toBe(`127.0.0.1:${port}`);
    } finally { server.close(); }
  });

  it('normalizes values before comparing resolver answers', () => {
    const result = compareDnsResults([
      { label: 'first', rcode: 0, answers: [{ name: 'example.test', type: 'A', value: '192.0.2.9', ttl: 60 }] },
      { label: 'second', rcode: 0, answers: [{ name: 'example.test', type: 'A', value: '192.0.2.9', ttl: 1 }] },
    ]);
    expect(result.consistent).toBe(true);
    expect(compareDnsResults([...result.valuesByResolver.map((entry) => ({ ...entry, answers: [{ name: '', type: 'A', value: '192.0.2.9', ttl: 0 }] })), { label: 'failed', error: 'timeout' }]).consistent).toBe(false);
  });
});
