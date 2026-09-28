import { connect as tcpConnect, type Socket } from 'node:net';
import type { StartTlsProtocol } from '../src/app/core/platform/network-types';

/**
 * STARTTLS upgrade state machines (Phase 28 item 21). Each opens a plaintext TCP connection,
 * performs the protocol's negotiation up to the point TLS begins, and hands the raw socket back so
 * `network-tls.ts` can wrap it. Reads are capped and the whole exchange is time-bounded.
 */
export const DEFAULT_STARTTLS_PORT: Record<StartTlsProtocol, number> = {
  smtp: 587, imap: 143, pop3: 110, ftp: 21, ldap: 389, postgres: 5432, mysql: 3306, xmpp: 5222,
};
const MAX_BYTES = 65_536;

export interface StartTlsUpgrade { readonly socket: Socket; readonly transcript: readonly string[] }

function openSocket(host: string, port: number, signal: AbortSignal, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = tcpConnect({ host, port });
    const onAbort = () => { socket.destroy(); reject(new Error('Cancelled.')); };
    signal.addEventListener('abort', onAbort, { once: true });
    socket.setTimeout(timeoutMs, () => { socket.destroy(new Error('STARTTLS negotiation timed out.')); });
    socket.once('connect', () => { signal.removeEventListener('abort', onAbort); resolve(socket); });
    socket.once('error', (error) => { signal.removeEventListener('abort', onAbort); reject(error); });
  });
}

/** Read text until `predicate` is satisfied by the accumulated buffer, or reject. */
function readUntil(socket: Socket, predicate: (data: string) => boolean, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const onData = (chunk: Buffer) => {
      data += chunk.toString('latin1');
      if (data.length > MAX_BYTES) { cleanup(); reject(new Error(`${label}: response too large.`)); return; }
      if (predicate(data)) { cleanup(); resolve(data); }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error(`${label}: connection closed during negotiation.`)); };
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('close', onClose); };
    socket.on('data', onData); socket.once('error', onError); socket.once('close', onClose);
  });
}
function readBytes(socket: Socket, predicate: (data: Buffer) => boolean, label: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > MAX_BYTES) { cleanup(); reject(new Error(`${label}: response too large.`)); return; }
      if (predicate(data)) { cleanup(); resolve(data); }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error(`${label}: connection closed during negotiation.`)); };
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError); socket.off('close', onClose); };
    socket.on('data', onData); socket.once('error', onError); socket.once('close', onClose);
  });
}
const lastLineOk = (data: string, code: string): boolean => { const lines = data.replace(/\r?\n$/, '').split(/\r?\n/); const last = lines.at(-1) ?? ''; return last.startsWith(`${code} `) || (last.length >= 4 && last[3] === ' '); };

export async function startTlsUpgrade(protocol: StartTlsProtocol, host: string, port: number, signal: AbortSignal, timeoutMs: number): Promise<StartTlsUpgrade> {
  const target = port || DEFAULT_STARTTLS_PORT[protocol];
  const socket = await openSocket(host, target, signal, timeoutMs);
  const transcript: string[] = [];
  const send = (line: string) => { transcript.push(`C: ${line.trim()}`); socket.write(line); };
  const expect = async (predicate: (data: string) => boolean, label: string) => { const data = await readUntil(socket, predicate, label); transcript.push(`S: ${data.trim()}`); return data; };
  try {
    switch (protocol) {
      case 'smtp': {
        await expect((data) => lastLineOk(data, '220'), 'SMTP greeting');
        send(`EHLO dude.local\r\n`);
        const ehlo = await expect((data) => lastLineOk(data, '250'), 'EHLO');
        if (!/STARTTLS/i.test(ehlo)) throw new Error('The server did not advertise STARTTLS.');
        send('STARTTLS\r\n');
        await expect((data) => lastLineOk(data, '220'), 'STARTTLS');
        break;
      }
      case 'imap': {
        await expect((data) => /^\* OK/im.test(data), 'IMAP greeting');
        send('a1 CAPABILITY\r\n');
        const caps = await expect((data) => /^a1 (OK|NO|BAD)/im.test(data), 'CAPABILITY');
        if (!/STARTTLS/i.test(caps)) throw new Error('The server did not advertise STARTTLS.');
        send('a2 STARTTLS\r\n');
        await expect((data) => /^a2 OK/im.test(data), 'STARTTLS');
        break;
      }
      case 'pop3': {
        await expect((data) => /^\+OK/m.test(data), 'POP3 greeting');
        send('STLS\r\n');
        await expect((data) => /^\+OK/m.test(data), 'STLS');
        break;
      }
      case 'ftp': {
        await expect((data) => lastLineOk(data, '220'), 'FTP greeting');
        send('AUTH TLS\r\n');
        await expect((data) => lastLineOk(data, '234'), 'AUTH TLS');
        break;
      }
      case 'xmpp': {
        send(`<?xml version='1.0'?><stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' to='${host}' version='1.0'>`);
        const features = await expect((data) => /<\/stream:features>|starttls/i.test(data), 'stream features');
        if (!/starttls/i.test(features)) throw new Error('The server did not offer XMPP STARTTLS.');
        send(`<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls'/>`);
        await expect((data) => /<proceed|<failure/i.test(data), 'proceed');
        break;
      }
      case 'ldap': {
        // LDAP StartTLS extended request (OID 1.3.6.1.4.1.1466.20037), messageID 1.
        const oid = Buffer.from('1.3.6.1.4.1.1466.20037', 'latin1');
        const req = Buffer.from([0x30, 0x1d, 0x02, 0x01, 0x01, 0x77, 0x18, 0x80, oid.length, ...oid]);
        transcript.push('C: StartTLS extended request');
        socket.write(req);
        const response = await readBytes(socket, (data) => data.length >= 2 && data.length >= (data[1] & 0x80 ? 0 : data[1] + 2), 'LDAP StartTLS');
        if (!response.includes(0x0a)) { /* resultCode enumerated */ }
        transcript.push('S: extended response received');
        break;
      }
      case 'postgres': {
        // SSLRequest: length 8, code 80877103.
        transcript.push('C: SSLRequest');
        socket.write(Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]));
        const response = await readBytes(socket, (data) => data.length >= 1, 'PostgreSQL SSLRequest');
        transcript.push(`S: ${String.fromCharCode(response[0])}`);
        if (response[0] !== 0x53) throw new Error(`PostgreSQL refused TLS (server replied '${String.fromCharCode(response[0])}').`);
        break;
      }
      case 'mysql': {
        // Read the initial handshake, confirm CLIENT_SSL, then send an SSLRequest packet.
        const handshake = await readBytes(socket, (data) => data.length >= 4 && data.length >= 4 + (data[0] | (data[1] << 8) | (data[2] << 16)), 'MySQL handshake');
        const capsOffset = (() => { let at = 4 + 1; while (handshake[at] !== 0) at++; at += 1 + 8 + 1; return at; })();
        const capabilities = handshake.readUInt16LE(capsOffset);
        if (!(capabilities & 0x0800)) throw new Error('The MySQL server does not advertise CLIENT_SSL.');
        transcript.push('S: initial handshake (CLIENT_SSL advertised)');
        const sequence = (handshake[3] + 1) & 0xff;
        const payload = Buffer.alloc(32);
        payload.writeUInt32LE(0x00000800 | 0x00008000 | 0x00000200 | 0x00020000, 0); // SSL | PROTOCOL_41 | LONG_PASSWORD | SECURE_CONNECTION
        payload.writeUInt32LE(0x01000000, 4);
        payload[8] = 0x21; // utf8 collation
        const packet = Buffer.concat([Buffer.from([payload.length, 0, 0, sequence]), payload]);
        transcript.push('C: SSLRequest');
        socket.write(packet);
        break;
      }
    }
  } catch (error) {
    socket.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
  socket.setTimeout(0);
  return { socket, transcript };
}
