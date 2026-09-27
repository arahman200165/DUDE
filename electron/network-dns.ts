import { Resolver } from 'node:dns/promises';
import { connect as tlsConnect } from 'node:tls';
import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import type { DnsRecordType, NetworkRequest } from '../src/app/core/platform/network-types';

const TYPES: Record<DnsRecordType, number> = { A: 1, NS: 2, CNAME: 5, PTR: 12, MX: 15, TXT: 16, AAAA: 28, SRV: 33 };
const MAX_DNS_BYTES = 65_535;

function encodeName(name: string): Buffer {
  const labels = name.replace(/\.$/, '').split('.');
  if (labels.some((label) => !label || Buffer.byteLength(label) > 63)) throw new Error('Invalid DNS name.');
  return Buffer.concat([...labels.map((label) => Buffer.concat([Buffer.from([Buffer.byteLength(label)]), Buffer.from(label)])), Buffer.from([0])]);
}
function encodeQuery(name: string, type: DnsRecordType, id: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  return Buffer.concat([header, encodeName(name), Buffer.from([0, TYPES[type], 0, 1])]);
}
function readName(packet: Buffer, start: number): { name: string; next: number } {
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
    labels.push(packet.toString('utf8', at, at + length));
    at += length;
  }
  throw new Error('DNS name exceeds parser limit.');
}
function formatIPv6(data: Buffer): string {
  const words = Array.from({ length: 8 }, (_, index) => data.readUInt16BE(index * 2).toString(16));
  return words.join(':');
}
export interface DnsAnswer { readonly name: string; readonly type: string; readonly ttl: number; readonly value: string }
function decodeResponse(packet: Buffer, expectedId: number): { answers: DnsAnswer[]; rcode: number } {
  if (packet.length < 12 || packet.length > MAX_DNS_BYTES) throw new Error('Invalid DNS response size.');
  if (packet.readUInt16BE(0) !== expectedId || !(packet.readUInt16BE(2) & 0x8000)) throw new Error('Mismatched DNS response.');
  const qCount = packet.readUInt16BE(4);
  const aCount = packet.readUInt16BE(6);
  let at = 12;
  for (let i = 0; i < qCount; i++) { at = readName(packet, at).next + 4; if (at > packet.length) throw new Error('Truncated DNS question.'); }
  const answers: DnsAnswer[] = [];
  for (let i = 0; i < aCount; i++) {
    const owner = readName(packet, at); at = owner.next;
    if (at + 10 > packet.length) throw new Error('Truncated DNS answer.');
    const type = packet.readUInt16BE(at); const ttl = packet.readUInt32BE(at + 4); const length = packet.readUInt16BE(at + 8);
    at += 10; const end = at + length;
    if (end > packet.length) throw new Error('Truncated DNS data.');
    let value: string;
    if (type === 1 && length === 4) value = [...packet.subarray(at, end)].join('.');
    else if (type === 28 && length === 16) value = formatIPv6(packet.subarray(at, end));
    else if ([2, 5, 12].includes(type)) value = readName(packet, at).name;
    else if (type === 15 && length >= 3) value = `${packet.readUInt16BE(at)} ${readName(packet, at + 2).name}`;
    else if (type === 33 && length >= 7) value = `${packet.readUInt16BE(at)} ${packet.readUInt16BE(at + 2)} ${packet.readUInt16BE(at + 4)} ${readName(packet, at + 6).name}`;
    else if (type === 16) { const parts: string[] = []; for (let pos = at; pos < end;) { const size = packet[pos++]; if (pos + size > end) throw new Error('Truncated TXT record.'); parts.push(packet.toString('utf8', pos, pos + size)); pos += size; } value = parts.join(''); }
    else value = packet.subarray(at, end).toString('hex');
    answers.push({ name: owner.name, type: Object.keys(TYPES).find((key) => TYPES[key as DnsRecordType] === type) ?? String(type), ttl, value });
    at = end;
  }
  return { answers, rcode: packet.readUInt16BE(2) & 0xf };
}
function reverseName(address: string): string {
  if (isIP(address) === 4) return `${address.split('.').reverse().join('.')}.in-addr.arpa`;
  if (isIP(address) === 6) {
    const expanded = address.split('::');
    const left = expanded[0] ? expanded[0].split(':') : [];
    const right = expanded[1] ? expanded[1].split(':') : [];
    const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    return `${words.map((word) => word.padStart(4, '0')).join('').split('').reverse().join('.')}.ip6.arpa`;
  }
  throw new Error('Reverse DNS requires an IP address.');
}

/** Query one independent resolver; never change Node's process-global DNS settings. */
export async function queryDns(request: NetworkRequest, signal: AbortSignal): Promise<{ answers: DnsAnswer[]; rcode: number; server: string; transport: string }> {
  const type = request.kind === 'reverse-dns' ? 'PTR' : request.recordType ?? 'A';
  const name = request.kind === 'reverse-dns' ? reverseName(request.target ?? '') : request.target ?? '';
  const transport = request.resolverTransport ?? 'classic';
  const server = request.resolver || (transport === 'doh' ? 'https://cloudflare-dns.com/dns-query' : transport === 'dot' ? 'one.one.one.one' : 'system');
  if (transport === 'classic') {
    const resolver = new Resolver({ timeout: 5000, tries: 1 });
    if (server !== 'system') resolver.setServers([server]);
    signal.addEventListener('abort', () => resolver.cancel(), { once: true });
    const raw = await resolver.resolve(name, type);
    const answers: DnsAnswer[] = (raw as unknown[]).map((entry) => ({ name, type, ttl: 0, value: typeof entry === 'string' ? entry : JSON.stringify(entry) }));
    return { answers, rcode: 0, server, transport };
  }
  const id = randomInt(0, 65536);
  const wire = encodeQuery(name, type, id);
  let response: Buffer;
  if (transport === 'doh') {
    const endpoint = new URL(server);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('DoH requires a trusted HTTPS endpoint.');
    const result = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' }, body: Uint8Array.from(wire), signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (!result.ok || result.headers.get('content-type')?.split(';')[0] !== 'application/dns-message') throw new Error(`DoH returned HTTP ${result.status} or an unexpected content type.`);
    const chunks: Buffer[] = [];
    let total = 0;
    if (!result.body) throw new Error('Empty DoH response.');
    for await (const chunk of result.body) {
      total += chunk.length;
      if (total > MAX_DNS_BYTES) throw new Error('DoH response too large.');
      chunks.push(Buffer.from(chunk));
    }
    response = Buffer.concat(chunks);
  } else if (transport === 'dot') {
    const hostname = server.trim();
    if (!hostname || hostname.includes('/') || hostname.includes(':')) throw new Error('DoT server must be a hostname.');
    response = await new Promise<Buffer>((resolve, reject) => {
      const socket = tlsConnect({ host: hostname, port: 853, servername: hostname, rejectUnauthorized: true });
      let bytes = Buffer.alloc(0);
      const abort = () => socket.destroy(new Error('Cancelled.'));
      signal.addEventListener('abort', abort, { once: true });
      socket.setTimeout(5000, () => socket.destroy(new Error('DoT timed out.')));
      socket.on('secureConnect', () => { const length = Buffer.alloc(2); length.writeUInt16BE(wire.length); socket.write(Buffer.concat([length, wire])); });
      socket.on('data', (chunk: Buffer) => { bytes = Buffer.concat([bytes, chunk]); if (bytes.length > MAX_DNS_BYTES + 2) socket.destroy(new Error('DoT response too large.')); else if (bytes.length >= 2 && bytes.length >= bytes.readUInt16BE(0) + 2) { socket.end(); resolve(bytes.subarray(2, bytes.readUInt16BE(0) + 2)); } });
      socket.on('error', reject);
      socket.on('close', () => signal.removeEventListener('abort', abort));
    });
  } else throw new Error('Unsupported DNS transport.');
  return { ...decodeResponse(response, id), server, transport };
}

export function compareDnsResults(results: readonly { label: string; answers?: readonly DnsAnswer[]; rcode?: number; error?: string }[]): {
  consistent: boolean; valuesByResolver: readonly { label: string; values: readonly string[]; rcode?: number; error?: string }[];
} {
  const valuesByResolver = results.map((result) => ({
    label: result.label,
    values: [...new Set((result.answers ?? []).map((answer) => `${answer.type}:${answer.value.trim().toLowerCase()}`))].sort(),
    ...(result.rcode !== undefined ? { rcode: result.rcode } : {}),
    ...(result.error ? { error: result.error } : {}),
  }));
  const first = valuesByResolver[0];
  const consistent = !!first && valuesByResolver.every((result) => !result.error && result.rcode === first.rcode && JSON.stringify(result.values) === JSON.stringify(first.values));
  return { consistent, valuesByResolver };
}
