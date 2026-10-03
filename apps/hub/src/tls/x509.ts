import { createHash, createPrivateKey, createPublicKey, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { isIPv6 } from 'node:net';
import os from 'node:os';
import { bitString, boolean, contextExplicit, contextImplicit, integer, integerFromNumber, octetString, oid, sequence, set, tlv, utf8String, x509Time } from './der-writer.js';

export const OID = {
  commonName: '2.5.4.3',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  ecPublicKey: '1.2.840.10045.2.1',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  subjectAltName: '2.5.29.17',
  subjectKeyIdentifier: '2.5.29.14',
  authorityKeyIdentifier: '2.5.29.35',
  nameConstraints: '2.5.29.30',
} as const;

export const extension = (id: string, critical: boolean, value: Buffer): Buffer =>
  sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value));

export function ipBytes(address: string): Buffer {
  if (!isIPv6(address)) return Buffer.from(address.split('.').map(Number));
  const [head, tail = ''] = address.split('::');
  const parse = (part: string): number[] => (part ? part.split(':').flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 0xff]) : []);
  const left = parse(head ?? '');
  const right = address.includes('::') ? parse(tail) : [];
  return Buffer.from([...left, ...new Array(16 - left.length - right.length).fill(0), ...right]);
}

export const isIpLiteral = (name: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || isIPv6(name);

export function generalName(name: string): Buffer {
  return isIpLiteral(name) ? contextImplicit(7, ipBytes(name)) : contextImplicit(2, Buffer.from(name, 'ascii'));
}

export const pemEncode = (label: string, der: Buffer): string =>
  `-----BEGIN ${label}-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').trimEnd()}\n-----END ${label}-----\n`;

/** SubjectKeyIdentifier: SHA-1 of the subjectPublicKey (the uncompressed EC point, the last 65 bytes of a P-256 SPKI). */
export const skiFromSpki = (spki: Buffer): Buffer => createHash('sha1').update(spki.subarray(spki.length - 65)).digest();

export function skiOfKey(key: KeyObject): Buffer {
  const pub = key.type === 'private' ? createPublicKey(key) : key;
  return skiFromSpki(pub.export({ type: 'spki', format: 'der' }));
}

export const commonName = (cn: string): Buffer => sequence(set(sequence(oid(OID.commonName), utf8String(cn))));

/** basicConstraints value: `cA` and an optional pathLenConstraint (cA false encodes the empty default). */
export const basicConstraintsValue = (ca: boolean, pathLen?: number): Buffer =>
  ca ? sequence(boolean(true), ...(pathLen !== undefined ? [integerFromNumber(pathLen)] : [])) : sequence();

export const KEY_USAGE = { digitalSignature: 0, keyCertSign: 5, cRLSign: 6 } as const;

/** keyUsage value from bit positions, as a minimal DER BIT STRING (trailing zero bits are not encoded). */
export function keyUsageValue(bits: readonly number[]): Buffer {
  const highest = Math.max(...bits);
  const bytes = Buffer.alloc(Math.floor(highest / 8) + 1);
  for (const bit of bits) bytes[Math.floor(bit / 8)]! |= 0x80 >> bit % 8;
  return bitString(bytes, 7 - (highest % 8));
}

/** AuthorityKeyIdentifier: `SEQUENCE { [0] IMPLICIT keyIdentifier }`. */
export const authorityKeyIdentifierValue = (keyId: Buffer): Buffer => sequence(contextImplicit(0, keyId));

export interface IpSubtree { address: string; prefix: number }

export function ipSubtreeBytes(subtree: IpSubtree): Buffer {
  const addr = ipBytes(subtree.address);
  const mask = Buffer.alloc(addr.length);
  for (let i = 0; i < subtree.prefix; i++) mask[i >> 3]! |= 0x80 >> (i & 7);
  return Buffer.concat([addr, mask]);
}

/** nameConstraints value with permitted subtrees only: `SEQUENCE { [0] IMPLICIT GeneralSubtrees }`. */
export function nameConstraintsValue(dnsNames: readonly string[], ipSubtrees: readonly IpSubtree[]): Buffer {
  const subtrees = [
    ...dnsNames.map((name) => sequence(contextImplicit(2, Buffer.from(name, 'ascii')))),
    ...ipSubtrees.map((subtree) => sequence(contextImplicit(7, ipSubtreeBytes(subtree)))),
  ];
  return sequence(tlv(0xa0, Buffer.concat(subtrees)));
}

export interface CertificateParts {
  subjectCn: string;
  issuerCn: string;
  spki: Buffer;
  notBefore: Date;
  notAfter: Date;
  extensions: readonly Buffer[];
  signerKey: KeyObject;
}

/** Assembles and signs (ECDSA P-256 / SHA-256) an X.509 v3 certificate; returns the DER. */
export function buildCertificate(parts: CertificateParts): Buffer {
  const serial = randomBytes(16);
  serial[0]! &= 0x7f;
  if (serial[0] === 0) serial[0] = 1;
  const sigAlg = sequence(oid(OID.ecdsaWithSha256));
  const tbs = sequence(
    contextExplicit(0, integerFromNumber(2)),
    integer(serial),
    sigAlg,
    commonName(parts.issuerCn),
    sequence(x509Time(parts.notBefore), x509Time(parts.notAfter)),
    commonName(parts.subjectCn),
    parts.spki,
    contextExplicit(3, sequence(...parts.extensions)),
  );
  return sequence(tbs, sigAlg, bitString(sign('sha256', tbs, parts.signerKey)));
}

export const privateKeyFromPem = (pem: string): KeyObject => createPrivateKey(pem);

// ---- minimal DER reading (extensions only) ----

interface Tlv { tag: number; start: number; contentStart: number; end: number }

function readTlv(buf: Buffer, offset: number): Tlv {
  const tag = buf[offset]!;
  let len = buf[offset + 1]!;
  let contentStart = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[contentStart + i]!;
    contentStart += n;
  }
  return { tag, start: offset, contentStart, end: contentStart + len };
}

function children(buf: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let at = parent.contentStart; at < parent.end;) {
    const item = readTlv(buf, at);
    out.push(item);
    at = item.end;
  }
  return out;
}

function decodeOid(content: Buffer): string {
  const arcs: number[] = [Math.floor(content[0]! / 40), content[0]! % 40];
  let value = 0;
  for (const byte of content.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) { arcs.push(value); value = 0; }
  }
  return arcs.join('.');
}

export interface ParsedExtension { oid: string; critical: boolean; value: Buffer }

/** The extensions of a DER certificate (OID, criticality, raw extnValue contents). */
export function certificateExtensions(der: Buffer): ParsedExtension[] {
  const tbs = children(der, readTlv(der, 0))[0]!;
  const wrapper = children(der, tbs).find((item) => item.tag === 0xa3);
  if (!wrapper) return [];
  const list = readTlv(der, wrapper.contentStart);
  return children(der, list).map((ext) => {
    const [id, second, third] = children(der, ext) as [Tlv, Tlv, Tlv | undefined];
    const critical = third !== undefined && der[second.contentStart] === 0xff;
    const valueTlv = third ?? second;
    return { oid: decodeOid(der.subarray(id.contentStart, id.end)), critical, value: der.subarray(valueTlv.contentStart, valueTlv.end) };
  });
}

export interface ParsedNameConstraints { permittedDns: string[]; permittedIps: IpSubtree[]; excludedCount: number }

function formatIp(bytes: Buffer): string {
  if (bytes.length === 4) return [...bytes].join('.');
  const groups = Array.from({ length: 8 }, (_, i) => ((bytes[i * 2]! << 8) | bytes[i * 2 + 1]!).toString(16));
  let best = { at: -1, len: 0 };
  for (let i = 0; i < 8;) {
    if (groups[i] !== '0') { i++; continue; }
    let j = i;
    while (j < 8 && groups[j] === '0') j++;
    if (j - i > best.len) best = { at: i, len: j - i };
    i = j;
  }
  if (best.len < 2) return groups.join(':');
  return `${groups.slice(0, best.at).join(':')}::${groups.slice(best.at + best.len).join(':')}`;
}

/** Decodes a nameConstraints extnValue (the `value` of {@link certificateExtensions}). */
export function parseNameConstraints(value: Buffer): ParsedNameConstraints {
  const result: ParsedNameConstraints = { permittedDns: [], permittedIps: [], excludedCount: 0 };
  for (const group of children(value, readTlv(value, 0))) {
    for (const subtree of children(value, group)) {
      const [name] = children(value, subtree);
      if (!name) continue;
      if (group.tag === 0xa1) { result.excludedCount++; continue; }
      const content = value.subarray(name.contentStart, name.end);
      if (name.tag === 0x82) result.permittedDns.push(content.toString('ascii'));
      else if (name.tag === 0x87) {
        const half = content.length / 2;
        let prefix = 0;
        for (const byte of content.subarray(half)) prefix += byte.toString(2).replace(/0/g, '').length;
        result.permittedIps.push({ address: formatIp(content.subarray(0, half)), prefix });
      }
    }
  }
  return result;
}

/** Whether `name` (DNS name or IP literal) falls inside the permitted subtrees (RFC 5280 section 4.2.1.10). */
export function isNamePermitted(constraints: ParsedNameConstraints, name: string): boolean {
  if (isIpLiteral(name)) {
    const addr = ipBytes(name);
    return constraints.permittedIps.some((subtree) => {
      const net = ipBytes(subtree.address);
      if (net.length !== addr.length) return false;
      for (let i = 0; i < subtree.prefix; i++) {
        const bit = 0x80 >> (i & 7);
        if ((addr[i >> 3]! & bit) !== (net[i >> 3]! & bit)) return false;
      }
      return true;
    });
  }
  const lower = name.toLowerCase();
  return constraints.permittedDns.some((base) => lower === base || lower.endsWith(`.${base}`));
}

/** Names always present in the SAN list, plus caller extras, de-duplicated. */
export function subjectAltNames(extra: readonly string[] = []): string[] {
  return [...new Set(['localhost', os.hostname(), '127.0.0.1', '::1', ...extra])];
}
