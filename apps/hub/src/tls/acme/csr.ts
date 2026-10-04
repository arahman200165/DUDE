/** PKCS#10 CertificationRequest (RFC 2986) for ACME finalize: ecdsa-with-SHA256, CN = first name, SAN in an extensionRequest. */
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { bitString, contextExplicit, integerFromNumber, oid, sequence, set } from '../der-writer.js';
import { OID, commonName, extension, generalName, pemEncode } from '../x509.js';

const OID_EXTENSION_REQUEST = '1.2.840.113549.1.9.14';

export function buildCsr({ names, key }: { names: string[]; key: KeyObject }): { der: Buffer; pem: string } {
  if (names.length === 0) throw new Error('A CSR needs at least one name');
  const spki = createPublicKey(key).export({ type: 'spki', format: 'der' });
  const san = extension(OID.subjectAltName, false, sequence(...names.map(generalName)));
  const extensionRequest = sequence(oid(OID_EXTENSION_REQUEST), set(sequence(san)));
  const info = sequence(integerFromNumber(0), commonName(names[0]!), spki, contextExplicit(0, extensionRequest));
  const sigAlg = sequence(oid(OID.ecdsaWithSha256));
  const der = sequence(info, sigAlg, bitString(sign('sha256', info, key)));
  return { der, pem: pemEncode('CERTIFICATE REQUEST', der) };
}

// ---- strict minimal DER reader ----

interface Node { tag: number; start: number; contentStart: number; end: number }

function read(buf: Buffer, offset: number, limit: number): Node {
  if (offset + 2 > limit) throw new Error('CSR: truncated');
  const tag = buf[offset]!;
  let len = buf[offset + 1]!;
  let contentStart = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 3 || contentStart + n > limit) throw new Error('CSR: bad length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[contentStart + i]!;
    contentStart += n;
  }
  const end = contentStart + len;
  if (end > limit) throw new Error('CSR: length overruns');
  return { tag, start: offset, contentStart, end };
}

function kids(buf: Buffer, parent: Node): Node[] {
  const out: Node[] = [];
  for (let at = parent.contentStart; at < parent.end;) {
    const item = read(buf, at, parent.end);
    out.push(item);
    at = item.end;
  }
  return out;
}

function expectTag(node: Node | undefined, tag: number): Node {
  if (!node || node.tag !== tag) throw new Error('CSR: unexpected structure');
  return node;
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

function formatIp(bytes: Buffer): string {
  if (bytes.length === 4) return [...bytes].join('.');
  if (bytes.length !== 16) throw new Error('CSR: bad iPAddress');
  return Array.from({ length: 8 }, (_, i) => ((bytes[i * 2]! << 8) | bytes[i * 2 + 1]!).toString(16)).join(':');
}

export interface VerifiedCsr {
  names: string[];
  publicKeySpkiSha256: string;
  /** The requested SubjectPublicKeyInfo, DER. */
  publicKeySpki: Buffer;
}

/** Parses a CSR strictly (version 0, ecdsa-with-SHA256, one extensionRequest SAN) and verifies its self-signature. */
export function verifyCsr(der: Buffer): VerifiedCsr {
  const root = expectTag(read(der, 0, der.length), 0x30);
  if (root.end !== der.length) throw new Error('CSR: trailing data');
  const top = kids(der, root);
  if (top.length !== 3) throw new Error('CSR: unexpected structure');
  const info = expectTag(top[0], 0x30);
  const parts = kids(der, info);
  if (parts.length !== 4) throw new Error('CSR: unexpected structure');
  const version = expectTag(parts[0], 0x02);
  if (version.end - version.contentStart !== 1 || der[version.contentStart] !== 0) throw new Error('CSR: unsupported version');
  expectTag(parts[1], 0x30);
  const spki = expectTag(parts[2], 0x30);
  const attrs = expectTag(parts[3], 0xa0);
  const algKids = kids(der, expectTag(top[1], 0x30));
  const algOid = expectTag(algKids[0], 0x06);
  if (algKids.length !== 1 || decodeOid(der.subarray(algOid.contentStart, algOid.end)) !== OID.ecdsaWithSha256) {
    throw new Error('CSR: signature algorithm must be ecdsa-with-SHA256');
  }
  const sigNode = expectTag(top[2], 0x03);
  if (der[sigNode.contentStart] !== 0) throw new Error('CSR: bad signature bit string');
  const signature = der.subarray(sigNode.contentStart + 1, sigNode.end);

  const spkiDer = der.subarray(spki.start, spki.end);
  const publicKey = createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
  if (!verify('sha256', der.subarray(info.start, info.end), publicKey, signature)) throw new Error('CSR: signature does not verify');

  const names: string[] = [];
  let sawExtensionRequest = false;
  for (const attr of kids(der, attrs)) {
    const [attrOid, values] = kids(der, expectTag(attr, 0x30));
    const attrId = expectTag(attrOid, 0x06);
    if (decodeOid(der.subarray(attrId.contentStart, attrId.end)) !== OID_EXTENSION_REQUEST) continue;
    if (sawExtensionRequest) throw new Error('CSR: duplicate extensionRequest');
    sawExtensionRequest = true;
    const [extList] = kids(der, expectTag(values, 0x31));
    for (const ext of kids(der, expectTag(extList, 0x30))) {
      const extParts = kids(der, expectTag(ext, 0x30));
      const id = expectTag(extParts[0], 0x06);
      if (decodeOid(der.subarray(id.contentStart, id.end)) !== OID.subjectAltName) continue;
      const valueNode = expectTag(extParts[extParts.length - 1], 0x04);
      const sanSeq = expectTag(read(der, valueNode.contentStart, valueNode.end), 0x30);
      for (const name of kids(der, sanSeq)) {
        const content = der.subarray(name.contentStart, name.end);
        if (name.tag === 0x82) names.push(content.toString('ascii'));
        else if (name.tag === 0x87) names.push(formatIp(content));
        else throw new Error('CSR: unsupported subjectAltName type');
      }
    }
  }
  if (names.length === 0) throw new Error('CSR: no subjectAltName');
  return { names, publicKeySpkiSha256: createHash('sha256').update(spkiDer).digest('hex'), publicKeySpki: Buffer.from(spkiDer) };
}
