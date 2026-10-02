import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { TLSSocket, connect as tlsConnect } from 'node:tls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startTlsUpgrade, DEFAULT_STARTTLS_PORT } from './network-starttls';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__/tls', name), 'utf8');
const key = fixture('leaf-key.pem');
const cert = `${fixture('leaf.pem')}${fixture('int.pem')}`;
const closers: (() => void)[] = [];
afterEach(() => { while (closers.length) closers.pop()!(); });

/** A scripted plaintext server that, after `onLine` signals go-ahead, wraps its socket as a TLS server. */
async function scriptedServer(script: (socket: Socket, startTls: () => void) => void): Promise<number> {
  const server: Server = createServer((socket) => {
    const startTls = () => {
      socket.removeAllListeners('data');
      const tls = new TLSSocket(socket, { isServer: true, key, cert });
      tls.on('error', () => {});
      tls.on('secureConnect', () => tls.end());
      tls.on('secure', () => tls.end());
    };
    script(socket, startTls);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());
  return (server.address() as AddressInfo).port;
}

async function expectUpgrade(protocol: Parameters<typeof startTlsUpgrade>[0], port: number): Promise<string[]> {
  const upgrade = await startTlsUpgrade(protocol, '127.0.0.1', port, new AbortController().signal, 5000);
  const tls = tlsConnect({ socket: upgrade.socket, rejectUnauthorized: false });
  await new Promise<void>((resolve, reject) => { tls.once('secureConnect', () => resolve()); tls.once('error', reject); });
  const protocolName = tls.getProtocol();
  tls.destroy();
  expect(protocolName).toMatch(/TLSv1\.[23]/);
  return upgrade.transcript;
}

describe('STARTTLS negotiation', () => {
  it('SMTP: EHLO advertises STARTTLS, then upgrades', async () => {
    const port = await scriptedServer((socket, startTls) => {
      socket.write('220 mail.test ESMTP\r\n');
      socket.on('data', (data) => {
        const line = data.toString();
        if (/^EHLO/i.test(line)) socket.write('250-mail.test\r\n250 STARTTLS\r\n');
        else if (/^STARTTLS/i.test(line)) { socket.write('220 Go ahead\r\n'); startTls(); }
      });
    });
    const transcript = await expectUpgrade('smtp', port);
    expect(transcript.some((line) => line.includes('STARTTLS'))).toBe(true);
  });

  it('IMAP: CAPABILITY then STARTTLS', async () => {
    const port = await scriptedServer((socket, startTls) => {
      socket.write('* OK IMAP ready\r\n');
      socket.on('data', (data) => {
        const line = data.toString();
        if (/CAPABILITY/i.test(line)) socket.write('* CAPABILITY IMAP4rev1 STARTTLS\r\na1 OK done\r\n');
        else if (/STARTTLS/i.test(line)) { socket.write('a2 OK begin TLS\r\n'); startTls(); }
      });
    });
    await expectUpgrade('imap', port);
  });

  it('POP3: STLS upgrade', async () => {
    const port = await scriptedServer((socket, startTls) => {
      socket.write('+OK POP3 ready\r\n');
      socket.on('data', (data) => { if (/STLS/i.test(data.toString())) { socket.write('+OK begin TLS\r\n'); startTls(); } });
    });
    await expectUpgrade('pop3', port);
  });

  it('PostgreSQL: SSLRequest answered with S upgrades; N is refused', async () => {
    const yes = await scriptedServer((socket, startTls) => { socket.once('data', () => { socket.write('S'); startTls(); }); });
    await expectUpgrade('postgres', yes);
    const no = await scriptedServer((socket) => { socket.once('data', () => socket.write('N')); });
    await expect(startTlsUpgrade('postgres', '127.0.0.1', no, new AbortController().signal, 5000)).rejects.toThrow(/refused TLS/);
  });

  it('fails cleanly when STARTTLS is not advertised', async () => {
    const port = await scriptedServer((socket) => {
      socket.write('220 mail.test ESMTP\r\n');
      socket.on('data', (data) => { if (/^EHLO/i.test(data.toString())) socket.write('250 mail.test\r\n'); });
    });
    await expect(startTlsUpgrade('smtp', '127.0.0.1', port, new AbortController().signal, 5000)).rejects.toThrow(/did not advertise/);
  });

  it('has a default port for every protocol', () => {
    expect(Object.keys(DEFAULT_STARTTLS_PORT)).toHaveLength(8);
    expect(DEFAULT_STARTTLS_PORT.smtp).toBe(587);
  });
});
