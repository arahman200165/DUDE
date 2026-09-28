import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type TlsOptions } from 'node:tls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { enumerateTls, enumerationPlan } from './network-tls-enumerate';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');
const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); });

async function server(options: TlsOptions): Promise<number> {
  const tls = createServer({ key: fixture('leaf-key.pem'), cert: `${fixture('leaf.pem')}${fixture('int.pem')}`, ...options }, (socket) => socket.end());
  tls.on('tlsClientError', () => {});
  await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve));
  closers.push(() => tls.close());
  return (tls.address() as AddressInfo).port;
}

describe('TLS version and cipher enumeration', () => {
  it('detects the offered version and stays within the handshake budget', async () => {
    const port = await server({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2' });
    const result = await enumerateTls({ kind: 'tls-enumeration', target: '127.0.0.1', port, sni: 'localhost' }, new AbortController().signal, () => {});
    expect(result.supportedVersions).toEqual(['TLSv1.2']);
    expect(result.versions.find((probe) => probe.version === 'TLSv1.3')?.state).toBe('rejected');
    expect(result.handshakes).toBeLessThanOrEqual(result.budget);
    expect(result.ciphers.some((probe) => probe.state === 'supported')).toBe(true);
    expect(result.weaknesses.some((finding) => finding.id === 'enum-no13')).toBe(true);
  });

  it('flags a legacy TLS version as a failure when the server offers it', async () => {
    const port = await server({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' });
    const result = await enumerateTls({ kind: 'tls-enumeration', target: '127.0.0.1', port, sni: 'localhost' }, new AbortController().signal, () => {});
    expect(result.supportedVersions).toContain('TLSv1.3');
    expect(result.weaknesses.some((finding) => finding.id === 'enum-no13')).toBe(false);
    expect(result.note).toMatch(/not testable from this client/);
  });

  it('exposes a fixed plan for the preview', () => {
    const plan = enumerationPlan({ kind: 'tls-enumeration', target: 'x' });
    expect(plan.versions).toBe(4);
    expect(plan.total).toBeLessThanOrEqual(128);
    expect(plan.total).toBe(Math.min(128, plan.versions + plan.ciphers));
  });
});
