import { Resolver } from 'node:dns/promises';
import { getServers as getSystemServers } from 'node:dns';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { connect as tcpConnect, type Socket } from 'node:net';
import { createSocket } from 'node:dgram';
import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import type { DnsRecordType, DnsTransport, NetworkRequest } from "@dude/contracts/core/platform/network-types";


export const TYPE_CODES: Record<DnsRecordType, number> = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33,
  DS: 43, RRSIG: 46, NSEC: 47, DNSKEY: 48, NSEC3: 50, TLSA: 52, SVCB: 64, HTTPS: 65, CAA: 257,
};
const TYPE_NAMES = new Map<number, string>([...Object.entries(TYPE_CODES).map(([name, code]) => [code, name] as [number, string]), [41, 'OPT'], [255, 'ANY'], [99, 'SPF'], [13, 'HINFO'], [44, 'SSHFP'], [257, 'CAA']]);
export const typeName = (code: number): string => TYPE_NAMES.get(code) ?? `TYPE${code}`;
const RCODES = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED', 'YXDOMAIN', 'YXRRSET', 'NXRRSET', 'NOTAUTH', 'NOTZONE'];
export const rcodeName = (code: number): string => RCODES[code] ?? (code === 16 ? 'BADVERS' : `RCODE${code}`);
const MAX_DNS_BYTES = 65_535;
const UDP_PAYLOAD = 1232;
let testCa: string | undefined;
/** Test seam: trust an extra CA for DoT loopback specs only. */
export function setDnsTlsCaForTesting(ca: string | undefined): void { testCa = ca; }
/** Types whose RDATA names are lowercased for DNSSEC canonical form (RFC 4034 §6.2 as amended by RFC 6840 §5.1). */
const CANONICAL_LOWER = new Set([2, 5, 6, 12, 15, 33, 46]);

export function encodeName(name: string): Buffer {
  const trimmed = name.replace(/\.$/, '');
  if (!trimmed) return Buffer.from([0]);
  const labels = trimmed.split('.');
  if (labels.some((label) => !label || Buffer.byteLength(label) > 63)) throw new Error('Invalid DNS name.');
  const encoded = Buffer.concat([...labels.map((label) => Buffer.concat([Buffer.from([Buffer.byteLength(label)]), Buffer.from(label)])), Buffer.from([0])]);
  if (encoded.length > 255) throw new Error('DNS name is longer than 255 bytes.');
  return encoded;
}

export interface QueryOptions {
  readonly dnssecOk?: boolean;
  readonly checkingDisabled?: boolean;
  readonly edns?: boolean;
  readonly timeoutMs?: number;
}

export function encodeQuery(name: string, type: number, id: number, options: QueryOptions = {}): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100 | (options.checkingDisabled ? 0x0010 : 0), 2);
  header.writeUInt16BE(1, 4);
  const edns = options.edns !== false;
  header.writeUInt16BE(edns ? 1 : 0, 10);
  const question = Buffer.concat([encodeName(name), Buffer.from([type >> 8, type & 0xff, 0, 1])]);
  if (!edns) return Buffer.concat([header, question]);
  // OPT pseudo-RR: root owner, TYPE 41, CLASS = UDP payload size, TTL = ext-rcode|version|DO flag.
  const opt = Buffer.alloc(11);
  opt.writeUInt16BE(41, 1);
  opt.writeUInt16BE(UDP_PAYLOAD, 3);
  opt.writeUInt16BE(options.dnssecOk ? 0x8000 : 0, 7);
  return Buffer.concat([header, question, opt]);
}

export function readName(packet: Buffer, start: number): { name: string; next: number } {
  let at = start;
  let next = start;
  let jumped = false;
  const labels: string[] = [];
  const seen = new Set<number>();
  for (let steps = 0; steps < 128; steps++) {
    if (at >= packet.length) throw new Error('Truncated DNS name.');
    const length = packet[at];
    if ((length & 0xc0) === 0xc0) {
      if (at + 1 >= packet.length) throw new Error('Truncated DNS pointer.');
      const pointer = ((length & 0x3f) << 8) | packet[at + 1];
      if (seen.has(pointer)) throw new Error('DNS pointer loop.');
      seen.add(pointer);
      if (!jumped) next = at + 2;
      jumped = true;
      at = pointer;
      continue;
    }
    if (length & 0xc0) throw new Error('Invalid DNS name label.');
    at++;
    if (length === 0) return { name: labels.join('.'), next: jumped ? next : at };
    if (at + length > packet.length) throw new Error('Truncated DNS label.');
    labels.push(packet.toString('latin1', at, at + length));
    at += length;
  }
  throw new Error('DNS name exceeds parser limit.');
}

function formatIPv6(data: Buffer): string {
  const words = Array.from({ length: 8 }, (_, index) => data.readUInt16BE(index * 2));
  let bestStart = -1, bestLength = 0;
  for (let i = 0; i < 8;) {
    if (words[i] !== 0) { i++; continue; }
    let j = i; while (j < 8 && words[j] === 0) j++;
    if (j - i > bestLength && j - i > 1) { bestStart = i; bestLength = j - i; }
    i = j;
  }
  const hex = words.map((word) => word.toString(16));
  if (bestStart < 0) return hex.join(':');
  return `${hex.slice(0, bestStart).join(':')}::${hex.slice(bestStart + bestLength).join(':')}`;
}

const BASE32HEX = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
export function base32hex(data: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of data) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32HEX[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31];
  return out;
}

function typeBitmap(data: Buffer): string[] {
  const types: string[] = [];
  for (let at = 0; at + 2 <= data.length;) {
    const window = data[at], length = data[at + 1];
    const bitmap = data.subarray(at + 2, at + 2 + length);
    bitmap.forEach((byte, index) => { for (let bit = 0; bit < 8; bit++) if (byte & (0x80 >> bit)) types.push(typeName(window * 256 + index * 8 + bit)); });
    at += 2 + length;
  }
  return types;
}

function dnssecTime(seconds: number): string {
  const date = new Date(seconds * 1000);
  return date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function characterStrings(data: Buffer): string[] {
  const parts: string[] = [];
  for (let pos = 0; pos < data.length;) {
    const size = data[pos++];
    if (pos + size > data.length) throw new Error('Truncated character-string.');
    parts.push(data.toString('utf8', pos, pos + size));
    pos += size;
  }
  return parts;
}

const SVC_KEYS = ['mandatory', 'alpn', 'no-default-alpn', 'port', 'ipv4hint', 'ech', 'ipv6hint'];
function svcParams(data: Buffer): string[] {
  const out: string[] = [];
  for (let at = 0; at + 4 <= data.length;) {
    const key = data.readUInt16BE(at), length = data.readUInt16BE(at + 2);
    const content = data.subarray(at + 4, at + 4 + length);
    const name = SVC_KEYS[key] ?? `key${key}`;
    let rendered: string;
    if (key === 1) rendered = characterStrings(content).join(',');
    else if (key === 2) rendered = '';
    else if (key === 3) rendered = String(content.readUInt16BE(0));
    else if (key === 4) rendered = Array.from({ length: content.length / 4 }, (_, i) => [...content.subarray(i * 4, i * 4 + 4)].join('.')).join(',');
    else if (key === 6) rendered = Array.from({ length: content.length / 16 }, (_, i) => formatIPv6(content.subarray(i * 16, i * 16 + 16))).join(',');
    else if (key === 0) rendered = Array.from({ length: content.length / 2 }, (_, i) => SVC_KEYS[content.readUInt16BE(i * 2)] ?? `key${content.readUInt16BE(i * 2)}`).join(',');
    else if (key === 5) rendered = content.toString('base64');
    else rendered = content.toString('hex');
    out.push(key === 2 ? name : `${name}=${rendered}`);
    at += 4 + length;
  }
  return out;
}

/** A decoded resource record. `rdata` is the uncompressed RDATA (names expanded, case preserved). */
export interface DnsRecord {
  readonly name: string;
  readonly type: string;
  readonly typeCode: number;
  readonly class: number;
  readonly ttl: number;
  readonly value: string;
  readonly rdata: Buffer;
  /** RDATA in DNSSEC canonical form (embedded names lowercased where RFC 4034/6840 require it). */
  readonly canonicalRdata: Buffer;
}

export interface DnsAnswer { readonly name: string; readonly type: string; readonly ttl: number; readonly value: string }

export interface DnsFlags { readonly qr: boolean; readonly aa: boolean; readonly tc: boolean; readonly rd: boolean; readonly ra: boolean; readonly ad: boolean; readonly cd: boolean }
export interface DnsMessage {
  readonly id: number;
  readonly flags: DnsFlags;
  readonly rcode: number;
  readonly answers: readonly DnsRecord[];
  readonly authority: readonly DnsRecord[];
  readonly additional: readonly DnsRecord[];
  readonly edns?: { readonly udpSize: number; readonly version: number; readonly dnssecOk: boolean; readonly options: readonly { code: number; hex: string }[] };
}

function decodeRdata(packet: Buffer, type: number, at: number, end: number): { value: string; rdata: Buffer; canonical: Buffer } {
  const data = packet.subarray(at, end);
  const name = (offset: number) => readName(packet, offset);
  const lower = CANONICAL_LOWER.has(type);
  const nameBytes = (text: string) => encodeName(lower ? text.toLowerCase() : text);
  const plain = (text: string) => encodeName(text);
  switch (type) {
    case 1: if (data.length !== 4) break; return { value: [...data].join('.'), rdata: data, canonical: data };
    case 28: if (data.length !== 16) break; return { value: formatIPv6(data), rdata: data, canonical: data };
    case 2: case 5: case 12: { const target = name(at).name; return { value: `${target}.`, rdata: plain(target), canonical: nameBytes(target) }; }
    case 15: {
      const exchange = name(at + 2);
      const pref = data.subarray(0, 2);
      return { value: `${data.readUInt16BE(0)} ${exchange.name}.`, rdata: Buffer.concat([pref, plain(exchange.name)]), canonical: Buffer.concat([pref, nameBytes(exchange.name)]) };
    }
    case 33: {
      const target = name(at + 6);
      const fixed = data.subarray(0, 6);
      return { value: `${data.readUInt16BE(0)} ${data.readUInt16BE(2)} ${data.readUInt16BE(4)} ${target.name}.`, rdata: Buffer.concat([fixed, plain(target.name)]), canonical: Buffer.concat([fixed, nameBytes(target.name)]) };
    }
    case 6: {
      const mname = name(at); const rname = name(mname.next);
      const numbers = packet.subarray(rname.next, rname.next + 20);
      if (numbers.length !== 20) break;
      const values = Array.from({ length: 5 }, (_, i) => numbers.readUInt32BE(i * 4));
      return { value: `${mname.name}. ${rname.name}. ${values.join(' ')}`, rdata: Buffer.concat([plain(mname.name), plain(rname.name), numbers]), canonical: Buffer.concat([nameBytes(mname.name), nameBytes(rname.name), numbers]) };
    }
    case 16: case 99: return { value: characterStrings(data).join(''), rdata: data, canonical: data };
    case 257: {
      const flags = data[0], tagLength = data[1];
      const tag = data.toString('latin1', 2, 2 + tagLength);
      return { value: `${flags} ${tag} "${data.toString('utf8', 2 + tagLength)}"`, rdata: data, canonical: data };
    }
    case 43: case 32769: {
      if (data.length < 4) break;
      return { value: `${data.readUInt16BE(0)} ${data[2]} ${data[3]} ${data.subarray(4).toString('hex').toUpperCase()}`, rdata: data, canonical: data };
    }
    case 48: {
      if (data.length < 4) break;
      return { value: `${data.readUInt16BE(0)} ${data[2]} ${data[3]} ${data.subarray(4).toString('base64')}`, rdata: data, canonical: data };
    }
    case 46: {
      if (data.length < 18) break;
      const signer = readName(packet, at + 18);
      const fixed = data.subarray(0, 18);
      const signature = packet.subarray(signer.next, end);
      const text = `${typeName(data.readUInt16BE(0))} ${data[2]} ${data[3]} ${data.readUInt32BE(4)} ${dnssecTime(data.readUInt32BE(8))} ${dnssecTime(data.readUInt32BE(12))} ${data.readUInt16BE(16)} ${signer.name}. ${signature.toString('base64')}`;
      return { value: text, rdata: Buffer.concat([fixed, plain(signer.name), signature]), canonical: Buffer.concat([fixed, nameBytes(signer.name), signature]) };
    }
    case 47: {
      const next = readName(packet, at);
      const bitmap = packet.subarray(next.next, end);
      const rdata = Buffer.concat([plain(next.name), bitmap]);
      return { value: `${next.name}. ${typeBitmap(bitmap).join(' ')}`, rdata, canonical: rdata };
    }
    case 50: {
      if (data.length < 5) break;
      const saltLength = data[4];
      const salt = data.subarray(5, 5 + saltLength);
      const hashLength = data[5 + saltLength];
      const hash = data.subarray(6 + saltLength, 6 + saltLength + hashLength);
      const bitmap = data.subarray(6 + saltLength + hashLength);
      return { value: `${data[0]} ${data[1]} ${data.readUInt16BE(2)} ${saltLength ? salt.toString('hex').toUpperCase() : '-'} ${base32hex(hash)} ${typeBitmap(bitmap).join(' ')}`, rdata: data, canonical: data };
    }
    case 51: { if (data.length < 5) break; return { value: `${data[0]} ${data[1]} ${data.readUInt16BE(2)} ${data[4] ? data.subarray(5, 5 + data[4]).toString('hex').toUpperCase() : '-'}`, rdata: data, canonical: data }; }
    case 52: { if (data.length < 3) break; return { value: `${data[0]} ${data[1]} ${data[2]} ${data.subarray(3).toString('hex').toUpperCase()}`, rdata: data, canonical: data }; }
    case 64: case 65: {
      const target = readName(packet, at + 2);
      const params = packet.subarray(target.next, end);
      const rdata = Buffer.concat([data.subarray(0, 2), plain(target.name), params]);
      return { value: `${data.readUInt16BE(0)} ${target.name || ''}. ${svcParams(params).join(' ')}`.trim(), rdata, canonical: rdata };
    }
  }
  return { value: `\\# ${data.length} ${data.toString('hex')}`, rdata: data, canonical: data };
}

export function decodeMessage(packet: Buffer, expectedId?: number): DnsMessage {
  if (packet.length < 12 || packet.length > MAX_DNS_BYTES) throw new Error('Invalid DNS response size.');
  const id = packet.readUInt16BE(0);
  const bits = packet.readUInt16BE(2);
  if ((expectedId !== undefined && id !== expectedId) || !(bits & 0x8000)) throw new Error('Mismatched DNS response.');
  const counts = [4, 6, 8, 10].map((offset) => packet.readUInt16BE(offset));
  let at = 12;
  for (let i = 0; i < counts[0]; i++) { at = readName(packet, at).next + 4; if (at > packet.length) throw new Error('Truncated DNS question.'); }
  const sections: DnsRecord[][] = [[], [], []];
  let edns: DnsMessage['edns'];
  let extendedRcode = 0;
  for (let section = 0; section < 3; section++) {
    for (let i = 0; i < counts[section + 1]; i++) {
      const owner = readName(packet, at); at = owner.next;
      if (at + 10 > packet.length) throw new Error('Truncated DNS record.');
      const type = packet.readUInt16BE(at), klass = packet.readUInt16BE(at + 2), ttl = packet.readUInt32BE(at + 4), length = packet.readUInt16BE(at + 8);
      at += 10; const end = at + length;
      if (end > packet.length) throw new Error('Truncated DNS data.');
      if (type === 41) {
        const options: { code: number; hex: string }[] = [];
        for (let pos = at; pos + 4 <= end;) { const code = packet.readUInt16BE(pos), size = packet.readUInt16BE(pos + 2); options.push({ code, hex: packet.subarray(pos + 4, pos + 4 + size).toString('hex') }); pos += 4 + size; }
        extendedRcode = ttl >>> 24;
        edns = { udpSize: klass, version: (ttl >>> 16) & 0xff, dnssecOk: (ttl & 0x8000) !== 0, options };
      } else {
        const decoded = decodeRdata(packet, type, at, end);
        sections[section].push({ name: owner.name, type: typeName(type), typeCode: type, class: klass, ttl, value: decoded.value, rdata: decoded.rdata, canonicalRdata: decoded.canonical });
      }
      at = end;
    }
  }
  return {
    id,
    flags: { qr: true, aa: !!(bits & 0x0400), tc: !!(bits & 0x0200), rd: !!(bits & 0x0100), ra: !!(bits & 0x0080), ad: !!(bits & 0x0020), cd: !!(bits & 0x0010) },
    rcode: (extendedRcode << 4) | (bits & 0xf),
    answers: sections[0], authority: sections[1], additional: sections[2], ...(edns ? { edns } : {}),
  };
}

export function reverseName(address: string): string {
  if (isIP(address) === 4) return `${address.split('.').reverse().join('.')}.in-addr.arpa`;
  if (isIP(address) === 6) {
    const expanded = address.split('%')[0].split('::');
    const left = expanded[0] ? expanded[0].split(':') : [];
    const right = expanded[1] ? expanded[1].split(':') : [];
    const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    return `${words.map((word) => word.padStart(4, '0')).join('').split('').reverse().join('.')}.ip6.arpa`;
  }
  throw new Error('Reverse DNS requires an IP address.');
}

// ---- Transports ----
export interface TransportDiagnostics {
  readonly transport: DnsTransport;
  readonly server: string;
  readonly contacted: string;
  readonly elapsedMs: number;
  readonly queryBytes: number;
  readonly responseBytes: number;
  readonly retriedOverTcp?: boolean;
  readonly http?: { readonly status: number; readonly contentType: string; readonly url: string };
  readonly tls?: { readonly protocol: string | null; readonly cipher: string | null; readonly authorized: boolean; readonly subject?: string; readonly issuer?: string; readonly validTo?: string; readonly alpn?: string | false | null };
}

/** Parse "1.2.3.4", "1.2.3.4:53", "[2001:db8::1]:53", or bare IPv6 into host/port. */
export function parseServerAddress(server: string, defaultPort: number): { host: string; port: number } {
  const trimmed = server.trim();
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(trimmed);
  if (bracket) return { host: bracket[1], port: bracket[2] ? Number(bracket[2]) : defaultPort };
  if (isIP(trimmed) === 6) return { host: trimmed, port: defaultPort };
  const parts = trimmed.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return { host: parts[0], port: Number(parts[1]) };
  return { host: trimmed, port: defaultPort };
}

/** The OS-configured DNS servers (what "system" queries over the wire). */
export function systemServers(): string[] {
  return getSystemServers();
}

function readFramed(socket: Socket | TLSSocket, query: Buffer, signal: AbortSignal, timeoutMs: number, label: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    const abort = () => socket.destroy(new Error('Cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`${label} timed out.`)));
    const send = () => { const length = Buffer.alloc(2); length.writeUInt16BE(query.length); socket.write(Buffer.concat([length, query])); };
    if ('encrypted' in socket && socket.encrypted) socket.once('secureConnect', send); else socket.once('connect', send);
    socket.on('data', (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > MAX_DNS_BYTES + 2) socket.destroy(new Error(`${label} response too large.`));
      else if (bytes.length >= 2 && bytes.length >= bytes.readUInt16BE(0) + 2) { socket.end(); resolve(bytes.subarray(2, bytes.readUInt16BE(0) + 2)); }
    });
    socket.on('error', reject);
    socket.on('close', () => { signal.removeEventListener('abort', abort); reject(new Error(`${label} connection closed before a response.`)); });
  });
}

function udpExchange(host: string, port: number, query: Buffer, id: number, signal: AbortSignal, timeoutMs: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const socket = createSocket(isIP(host) === 6 ? 'udp6' : 'udp4');
    let finished = false;
    const finish = (error: Error | null, value?: Buffer) => {
      if (finished) return; finished = true;
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error); else resolve(value!);
    };
    const onAbort = () => finish(new Error('Cancelled.'));
    const timer = setTimeout(() => finish(new Error('DNS query timed out.')), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    socket.on('message', (message, remote) => {
      if (remote.port !== port || message.length < 2 || message.readUInt16BE(0) !== id) return;
      finish(null, message);
    });
    socket.on('error', (error) => finish(error));
    socket.send(query, port, host, (error) => { if (error) finish(error); });
  });
}

export interface ExchangeResult { readonly packet: Buffer; readonly diagnostics: TransportDiagnostics }

/** Send one DNS message over the chosen transport; never touches Node's process-global DNS config. */
export async function exchange(server: string, transport: DnsTransport, query: Buffer, id: number, signal: AbortSignal, timeoutMs = 5000): Promise<ExchangeResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  if (transport === 'doh') {
    const endpoint = new URL(server);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('DoH requires a trusted HTTPS endpoint.');
    const result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' }, body: Uint8Array.from(query), signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs + 3000)]) });
    const contentType = result.headers.get('content-type')?.split(';')[0] ?? '';
    if (!result.ok || contentType !== 'application/dns-message') throw new Error(`DoH returned HTTP ${result.status} (${contentType || 'no content type'}).`);
    const chunks: Buffer[] = [];
    let total = 0;
    if (!result.body) throw new Error('Empty DoH response.');
    for await (const chunk of result.body) {
      total += chunk.length;
      if (total > MAX_DNS_BYTES) throw new Error('DoH response too large.');
      chunks.push(Buffer.from(chunk));
    }
    const packet = Buffer.concat(chunks);
    return { packet, diagnostics: { transport, server, contacted: endpoint.host, elapsedMs: elapsed(), queryBytes: query.length, responseBytes: packet.length, http: { status: result.status, contentType, url: endpoint.href } } };
  }
  if (transport === 'dot') {
    const { host, port } = parseServerAddress(server, 853);
    const socket = tlsConnect({ host, port, ...(isIP(host) ? {} : { servername: host }), rejectUnauthorized: true, ALPNProtocols: ['dot'], ...(testCa ? { ca: testCa } : {}) });
    const packet = await readFramed(socket, query, signal, timeoutMs, 'DoT');
    const certificate = socket.getPeerX509Certificate?.();
    return { packet, diagnostics: { transport, server, contacted: `${host}:${port}`, elapsedMs: elapsed(), queryBytes: query.length, responseBytes: packet.length,
      tls: { protocol: socket.getProtocol(), cipher: socket.getCipher()?.standardName ?? null, authorized: socket.authorized, subject: certificate?.subject, issuer: certificate?.issuer, validTo: certificate?.validTo, alpn: socket.alpnProtocol } } };
  }
  const resolved = server === 'system' || !server ? systemServers()[0] : server;
  if (!resolved) throw new Error('No system DNS server is configured.');
  const { host, port } = parseServerAddress(resolved, 53);
  if (!isIP(host)) throw new Error('Classic DNS servers must be IP addresses.');
  let packet = await udpExchange(host, port, query, id, signal, timeoutMs);
  let retriedOverTcp = false;
  if (packet.length >= 4 && packet.readUInt16BE(2) & 0x0200) {
    retriedOverTcp = true;
    packet = await readFramed(tcpConnect({ host, port }), query, signal, timeoutMs, 'DNS over TCP');
  }
  return { packet, diagnostics: { transport: 'classic', server: server || 'system', contacted: `${host}:${port}`, elapsedMs: elapsed(), queryBytes: query.length, responseBytes: packet.length, ...(retriedOverTcp ? { retriedOverTcp } : {}) } };
}

export interface WireResult { readonly message: DnsMessage; readonly diagnostics: TransportDiagnostics }

export async function wireQuery(name: string, type: number, server: string, transport: DnsTransport, options: QueryOptions, signal: AbortSignal): Promise<WireResult> {
  const id = randomInt(0, 65536);
  const query = encodeQuery(name, type, id, options);
  const { packet, diagnostics } = await exchange(server, transport, query, id, signal, options.timeoutMs ?? 5000);
  let message = decodeMessage(packet, id);
  if (message.rcode === 1 && options.edns !== false) {
    // FORMERR from an EDNS-unaware server: retry once without OPT.
    const retryId = randomInt(0, 65536);
    const retry = await exchange(server, transport, encodeQuery(name, type, retryId, { ...options, edns: false }), retryId, signal, options.timeoutMs ?? 5000);
    message = decodeMessage(retry.packet, retryId);
  }
  return { message, diagnostics };
}

export function defaultServer(transport: DnsTransport, resolver?: string): string {
  if (resolver) return resolver;
  return transport === 'doh' ? 'https://cloudflare-dns.com/dns-query' : transport === 'dot' ? 'one.one.one.one' : 'system';
}

export const publicRecord = (record: DnsRecord): DnsAnswer & { typeCode: number } => ({ name: record.name, type: record.type, typeCode: record.typeCode, ttl: record.ttl, value: record.value });

export interface DnsLookupResult {
  readonly name: string;
  readonly type: string;
  readonly server: string;
  readonly transport: DnsTransport;
  readonly rcode: number;
  readonly rcodeName: string;
  readonly flags: DnsFlags;
  readonly answers: readonly DnsAnswer[];
  readonly authority: readonly DnsAnswer[];
  readonly additional: readonly DnsAnswer[];
  readonly edns?: DnsMessage['edns'];
  readonly diagnostics: TransportDiagnostics;
}

/** Query one independent resolver; never change Node's process-global DNS settings. */
export async function queryDns(request: NetworkRequest, signal: AbortSignal): Promise<DnsLookupResult> {
  const type = request.kind === 'reverse-dns' ? 'PTR' : request.recordType ?? 'A';
  const name = request.kind === 'reverse-dns' ? reverseName(request.target ?? '') : (request.target ?? '').trim();
  const transport = request.resolverTransport ?? 'classic';
  const server = defaultServer(transport, request.resolver);
  if (transport === 'classic' && server === 'system' && !systemServers().length) return legacySystemQuery(name, type, signal);
  const { message, diagnostics } = await wireQuery(name, TYPE_CODES[type], server, transport, { dnssecOk: request.dnssecOk, checkingDisabled: request.checkingDisabled, timeoutMs: request.timeoutMs }, signal);
  return {
    name, type, server, transport, rcode: message.rcode, rcodeName: rcodeName(message.rcode), flags: message.flags,
    answers: message.answers.map(publicRecord), authority: message.authority.map(publicRecord), additional: message.additional.map(publicRecord),
    ...(message.edns ? { edns: message.edns } : {}), diagnostics,
  };
}

/** Fallback when Windows reports no DNS servers to Node: c-ares with its own defaults (no flags/TTL). */
async function legacySystemQuery(name: string, type: DnsRecordType, signal: AbortSignal): Promise<DnsLookupResult> {
  const resolver = new Resolver({ timeout: 5000, tries: 1 });
  signal.addEventListener('abort', () => resolver.cancel(), { once: true });
  const started = performance.now();
  const raw = await resolver.resolve(name, type as 'A');
  const answers: DnsAnswer[] = (raw as unknown[]).map((entry) => ({ name, type, ttl: 0, value: typeof entry === 'string' ? entry : JSON.stringify(entry) }));
  const flags = { qr: true, aa: false, tc: false, rd: true, ra: true, ad: false, cd: false };
  return { name, type, server: 'system', transport: 'classic', rcode: 0, rcodeName: 'NOERROR', flags, answers, authority: [], additional: [],
    diagnostics: { transport: 'classic', server: 'system', contacted: 'system resolver (c-ares defaults)', elapsedMs: Math.round(performance.now() - started), queryBytes: 0, responseBytes: 0 } };
}

export function compareDnsResults(results: readonly { label: string; answers?: readonly DnsAnswer[]; rcode?: number; error?: string; flags?: { ad?: boolean } }[]): {
  consistent: boolean;
  valuesByResolver: readonly { label: string; values: readonly string[]; rcode?: number; error?: string; minTtl?: number; maxTtl?: number; authenticated?: boolean }[];
  ttlSpread: number;
  onlyIn: readonly { label: string; values: readonly string[] }[];
} {
  const valuesByResolver = results.map((result) => {
    const ttls = (result.answers ?? []).map((answer) => answer.ttl);
    return {
      label: result.label,
      values: [...new Set((result.answers ?? []).map((answer) => `${answer.type}:${answer.value.trim().toLowerCase()}`))].sort(),
      ...(result.rcode !== undefined ? { rcode: result.rcode } : {}),
      ...(result.error ? { error: result.error } : {}),
      ...(ttls.length ? { minTtl: Math.min(...ttls), maxTtl: Math.max(...ttls) } : {}),
      ...(result.flags ? { authenticated: !!result.flags.ad } : {}),
    };
  });
  const first = valuesByResolver[0];
  const consistent = !!first && valuesByResolver.every((result) => !result.error && result.rcode === first.rcode && JSON.stringify(result.values) === JSON.stringify(first.values));
  const allTtls = valuesByResolver.flatMap((entry) => entry.maxTtl !== undefined ? [entry.minTtl!, entry.maxTtl] : []);
  const ttlSpread = allTtls.length ? Math.max(...allTtls) - Math.min(...allTtls) : 0;
  const everyValue = new Set(valuesByResolver.flatMap((entry) => entry.values));
  const onlyIn = valuesByResolver.map((entry) => ({ label: entry.label, values: entry.values.filter((value) => valuesByResolver.some((other) => other !== entry && !other.error && !other.values.includes(value))) }))
    .filter((entry) => entry.values.length && everyValue.size);
  return { consistent, valuesByResolver, ttlSpread, onlyIn };
}
