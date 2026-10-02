/**
 * Minimal DER reader/writer for the Phase 28 live-certificate layer (CRL distribution points,
 * embedded SCTs, OCSP requests/responses, CRLs). The renderer's `node-forge` stays in the
 * renderer; `apps/desktop/` may not runtime-import `apps/web/src/app/`, and `node:crypto`'s X509Certificate
 * doesn't expose every extension, so this reads just the structures those checks need.
 */

export interface DerNode {
  readonly tag: number;
  /** Tag class bits (0 universal, 0x40 application, 0x80 context, 0xc0 private). */
  readonly cls: number;
  readonly constructed: boolean;
  /** Tag number within its class. */
  readonly number: number;
  /** Offset of the first header byte within the source buffer. */
  readonly start: number;
  readonly headerLength: number;
  readonly length: number;
  readonly source: Buffer;
}

const MAX_DEPTH = 64;

export function readNode(source: Buffer, start = 0): DerNode {
  if (start + 2 > source.length) throw new Error('Truncated DER header.');
  const tag = source[start];
  if ((tag & 0x1f) === 0x1f) throw new Error('High-tag-number DER is not supported.');
  let at = start + 1;
  let length = source[at++];
  if (length & 0x80) {
    const bytes = length & 0x7f;
    if (bytes === 0 || bytes > 4) throw new Error('Unsupported DER length.');
    if (at + bytes > source.length) throw new Error('Truncated DER length.');
    length = 0;
    for (let i = 0; i < bytes; i++) length = length * 256 + source[at++];
  }
  if (at + length > source.length) throw new Error('Truncated DER value.');
  return { tag, cls: tag & 0xc0, constructed: (tag & 0x20) !== 0, number: tag & 0x1f, start, headerLength: at - start, length, source };
}

export function value(node: DerNode): Buffer {
  const begin = node.start + node.headerLength;
  return node.source.subarray(begin, begin + node.length);
}

/** Whole TLV bytes (header + value). */
export function raw(node: DerNode): Buffer {
  return node.source.subarray(node.start, node.start + node.headerLength + node.length);
}

export function children(node: DerNode): DerNode[] {
  const out: DerNode[] = [];
  const begin = node.start + node.headerLength;
  const end = begin + node.length;
  let at = begin;
  while (at < end) {
    const child = readNode(node.source, at);
    out.push(child);
    at = child.start + child.headerLength + child.length;
  }
  if (at !== end) throw new Error('DER children overrun their parent.');
  return out;
}

export function parse(source: Buffer): DerNode {
  const node = readNode(source, 0);
  return node;
}

/** Re-read a primitive OCTET STRING / BIT STRING's content as a DER value (extension wrappers). */
export function inner(node: DerNode, skipBitStringPad = false): DerNode {
  const content = value(node);
  return readNode(skipBitStringPad ? content.subarray(1) : content, 0);
}

export function oid(node: DerNode): string {
  if (node.tag !== 0x06) throw new Error('Expected an OBJECT IDENTIFIER.');
  const bytes = value(node);
  if (!bytes.length) throw new Error('Empty OBJECT IDENTIFIER.');
  const parts: number[] = [];
  let current = 0;
  for (let i = 0; i < bytes.length; i++) {
    current = current * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (!parts.length) parts.push(current < 80 ? Math.floor(current / 40) : 2, current < 80 ? current % 40 : current - 80);
      else parts.push(current);
      current = 0;
    }
  }
  return parts.join('.');
}

export function integerHex(node: DerNode): string {
  if (node.tag !== 0x02) throw new Error('Expected an INTEGER.');
  let bytes = value(node);
  while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.subarray(1);
  return bytes.toString('hex').toUpperCase();
}

export function integerNumber(node: DerNode): number {
  const hex = integerHex(node);
  return parseInt(hex, 16);
}

export function time(node: DerNode): string {
  const text = value(node).toString('latin1');
  if (node.tag === 0x17) {
    const year = Number(text.slice(0, 2));
    return `${year >= 50 ? 19 : 20}${text.slice(0, 2)}-${text.slice(2, 4)}-${text.slice(4, 6)}T${text.slice(6, 8)}:${text.slice(8, 10)}:${text.slice(10, 12)}Z`;
  }
  if (node.tag === 0x18) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}Z`;
  throw new Error('Expected a UTCTime or GeneralizedTime.');
}

/** Depth-first walk (bounded). Only descends into constructed nodes. */
export function walk(node: DerNode, visit: (node: DerNode, depth: number) => void, depth = 0): void {
  if (depth > MAX_DEPTH) throw new Error('DER nesting too deep.');
  visit(node, depth);
  if (node.constructed) for (const child of children(node)) walk(child, visit, depth + 1);
}

// ---- Writer ----
export function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  for (let value = length; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
export function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}
export const seq = (...parts: Buffer[]): Buffer => tlv(0x30, Buffer.concat(parts));
export const octets = (content: Buffer): Buffer => tlv(0x04, content);
export const nullValue = (): Buffer => Buffer.from([0x05, 0x00]);
export function integerFromHex(hex: string): Buffer {
  let bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex');
  if (!bytes.length) bytes = Buffer.from([0]);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tlv(0x02, bytes);
}
export function encodeOid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isInteger(part) || part < 0)) throw new Error('Invalid OID.');
  const bytes: number[] = [];
  const push = (value: number) => {
    const chunk: number[] = [value & 0x7f];
    for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) chunk.unshift((rest & 0x7f) | 0x80);
    bytes.push(...chunk);
  };
  push(parts[0] * 40 + parts[1]);
  for (const part of parts.slice(2)) push(part);
  return tlv(0x06, Buffer.from(bytes));
}

// ---- Certificate helpers ----
export interface CertificateParts {
  readonly tbs: DerNode;
  readonly signatureAlgorithm: string;
  readonly signature: Buffer;
  readonly serialHex: string;
  readonly issuerRaw: Buffer;
  readonly subjectRaw: Buffer;
  readonly spkiRaw: Buffer;
  readonly extensions: ReadonlyMap<string, { readonly critical: boolean; readonly value: Buffer }>;
}

export function certificateParts(der: Buffer): CertificateParts {
  const certificate = parse(der);
  const [tbs, algorithm, signature] = children(certificate);
  const fields = children(tbs);
  let index = 0;
  if (fields[0]?.tag === 0xa0) index++;
  const serial = fields[index++];
  index++; // tbs signature algorithm
  const issuer = fields[index++];
  index++; // validity
  const subject = fields[index++];
  const spki = fields[index++];
  const extensions = new Map<string, { critical: boolean; value: Buffer }>();
  for (const field of fields.slice(index)) {
    if (field.tag !== 0xa3) continue;
    for (const extension of children(children(field)[0])) {
      const parts = children(extension);
      const critical = parts.length === 3 && parts[1].tag === 0x01 && value(parts[1])[0] !== 0;
      extensions.set(oid(parts[0]), { critical, value: value(parts[parts.length - 1]) });
    }
  }
  return {
    tbs, signatureAlgorithm: oid(children(algorithm)[0]), signature: value(signature).subarray(1),
    serialHex: integerHex(serial), issuerRaw: raw(issuer), subjectRaw: raw(subject), spkiRaw: raw(spki), extensions,
  };
}

export const OID = {
  crlDistributionPoints: '2.5.29.31',
  authorityInfoAccess: '1.3.6.1.5.5.7.1.1',
  sctList: '1.3.6.1.4.1.11129.2.4.2',
  ocspNoCheck: '1.3.6.1.5.5.7.48.1.5',
  ocspBasic: '1.3.6.1.5.5.7.48.1.1',
  ocspNonce: '1.3.6.1.5.5.7.48.1.2',
  sha1: '1.3.14.3.2.26',
  crlReason: '2.5.29.21',
  crlNumber: '2.5.29.20',
  tlsFeature: '1.3.6.1.5.5.7.1.24',
} as const;

/** URIs ([6] IA5String) under a GeneralNames-bearing structure. */
export function uris(node: DerNode): string[] {
  const out: string[] = [];
  walk(node, (current) => { if (current.tag === 0x86) out.push(value(current).toString('latin1')); });
  return out;
}

export function crlDistributionPoints(der: Buffer): string[] {
  const extension = certificateParts(der).extensions.get(OID.crlDistributionPoints);
  return extension ? uris(parse(extension.value)) : [];
}

/** Raw TLS-encoded SCT list bytes (without the OCTET STRING wrapper), or null. */
export function embeddedSctList(der: Buffer): Buffer | null {
  const extension = certificateParts(der).extensions.get(OID.sctList);
  if (!extension) return null;
  const wrapped = parse(extension.value);
  return wrapped.tag === 0x04 ? value(wrapped) : null;
}

/** Split a TLS `SignedCertificateTimestampList` into individual serialized SCTs. */
export function splitSctList(list: Buffer): Buffer[] {
  if (list.length < 2) return [];
  const total = list.readUInt16BE(0);
  const out: Buffer[] = [];
  let at = 2;
  const end = Math.min(list.length, 2 + total);
  while (at + 2 <= end && out.length < 64) {
    const size = list.readUInt16BE(at);
    if (at + 2 + size > end) break;
    out.push(list.subarray(at + 2, at + 2 + size));
    at += 2 + size;
  }
  return out;
}
