import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:tls';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { captureTlsHandshake, setCaptureRunner, type CaptureRunner } from './network-capture';
import { setTrustStoresForTesting } from './network-tls';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');
const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); setTrustStoresForTesting(null); });

async function server(): Promise<number> {
  const tls = createServer({ key: fixture('leaf-key.pem'), cert: `${fixture('leaf.pem')}${fixture('int.pem')}` }, (socket) => socket.end());
  tls.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve));
  closers.push(() => tls.close());
  return (tls.address() as AddressInfo).port;
}

function fakeRunner(elevated: boolean): { runner: CaptureRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: CaptureRunner = {
    isElevated: async () => elevated,
    run: async (args) => {
      calls.push(args);
      if (args[0] === 'etl2pcap') { writeFileSync(args[3], Buffer.from('pcapng-stub')); return { code: 0, stdout: 'Processed 12 packets', stderr: '' }; }
      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return { runner, calls };
}

describe('TLS handshake capture (pktmon)', () => {
  it('refuses without elevation and never touches pktmon', async () => {
    const { runner, calls } = fakeRunner(false);
    setCaptureRunner(runner);
    await expect(captureTlsHandshake({ kind: 'tls-capture', target: '127.0.0.1', port: 443 }, new AbortController().signal, () => {})).rejects.toThrow(/elevated session/);
    expect(calls).toEqual([]);
  });

  it('adds a scoped filter, captures, converts, and always stops and removes the filter', async () => {
    setTrustStoresForTesting({ mozilla: [fixture('root.pem')], windows: [] });
    const port = await server();
    const { runner, calls } = fakeRunner(true);
    setCaptureRunner(runner);
    const result = await captureTlsHandshake({ kind: 'tls-capture', target: '127.0.0.1', port, sni: 'localhost' }, new AbortController().signal, () => {});
    expect(result.inspection.handshake.protocol).toMatch(/TLSv1\.[23]/);
    expect(result.capture.pcapngBase64).not.toBeNull();
    expect(result.capture.packets).toBe(12);
    const verbs = calls.map((args) => args.slice(0, 2).join(' '));
    expect(verbs).toContain('filter add');
    expect(verbs).toContain('start --capture');
    expect(verbs.filter((verb) => verb === 'stop').length).toBeGreaterThanOrEqual(1);
    expect(calls.at(-1)).toEqual(['filter', 'remove']);
  });

  it('stops the trace even if conversion fails', async () => {
    setTrustStoresForTesting({ mozilla: [fixture('root.pem')], windows: [] });
    const port = await server();
    const calls: string[][] = [];
    setCaptureRunner({
      isElevated: async () => true,
      run: async (args) => { calls.push(args); return args[0] === 'etl2pcap' ? { code: 1, stdout: '', stderr: 'boom' } : { code: 0, stdout: '', stderr: '' }; },
    });
    const result = await captureTlsHandshake({ kind: 'tls-capture', target: '127.0.0.1', port, sni: 'localhost' }, new AbortController().signal, () => {});
    expect(result.capture.pcapngBase64).toBeNull();
    expect(result.capture.error).toMatch(/etl2pcap/);
    expect(calls.filter((args) => args[0] === 'stop').length).toBeGreaterThanOrEqual(1);
    expect(calls.at(-1)).toEqual(['filter', 'remove']);
  });
});
