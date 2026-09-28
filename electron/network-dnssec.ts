import { createHash, createPublicKey, randomInt, verify, type KeyObject } from 'node:crypto';
import type { DnsTransport, NetworkRequest } from '../src/app/core/platform/network-types';
import { base32hex, decodeMessage, encodeName, encodeQuery, exchange, rcodeName, typeName, TYPE_CODES, type DnsMessage, type DnsRecord } from './network-dns';

/**
 * DNSSEC Inspector (DUDE_PRD.md §21 Phase 28 item 2): full local chain-of-trust validation from
 * the embedded IANA root trust anchors down to the target RRset. Every signature is verified here
 * with node:crypto; the resolver is only a transport (queries set DO and CD so bogus data is
 * returned for inspection instead of hidden behind SERVFAIL).
 */

/** IANA root zone KSK trust anchors (https://data.iana.org/root-anchors/root-anchors.xml). */
export const ROOT_TRUST_ANCHORS: readonly { readonly keyTag: number; readonly algorithm: number; readonly digestType: number; readonly digest: string; readonly label: string }[] = [
  { keyTag: 20326, algorithm: 8, digestType: 2, digest: 'E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D', label: 'KSK-2017' },
  { keyTag: 38696, algorithm: 8, digestType: 2, digest: '683D2D0ACB8C9B712A1948B27F741219298D0A450D612C483AF444A4C0FB2B16', label: 'KSK-2024' },
];

export const ALGORITHMS: Record<number, { readonly name: string; readonly status: 'recommended' | 'acceptable' | 'deprecated' | 'prohibited' | 'unsupported' }> = {
  1: { name: 'RSAMD5', status: 'prohibited' },
  3: { name: 'DSA', status: 'prohibited' },
  5: { name: 'RSASHA1', status: 'deprecated' },
  6: { name: 'DSA-NSEC3-SHA1', status: 'prohibited' },
  7: { name: 'RSASHA1-NSEC3-SHA1', status: 'deprecated' },
  8: { name: 'RSASHA256', status: 'recommended' },
  10: { name: 'RSASHA512', status: 'acceptable' },
  12: { name: 'ECC-GOST', status: 'prohibited' },
  13: { name: 'ECDSAP256SHA256', status: 'recommended' },
  14: { name: 'ECDSAP384SHA384', status: 'acceptable' },
  15: { name: 'ED25519', status: 'recommended' },
  16: { name: 'ED448', status: 'acceptable' },
};
const DIGESTS: Record<number, { readonly name: string; readonly hash: string; readonly status: 'recommended' | 'deprecated' }> = {
  1: { name: 'SHA-1', hash: 'sha1', status: 'deprecated' },
  2: { name: 'SHA-256', hash: 'sha256', status: 'recommended' },
  4: { name: 'SHA-384', hash: 'sha384', status: 'recommended' },
};
const MAX_NSEC3_ITERATIONS = 500;
const MAX_QUERIES = 64;

// ---- Canonical form helpers (RFC 4034 §6) ----
export const canonicalName = (name: string): Buffer => encodeName(name.toLowerCase());
export const labelCount = (name: string): number => name.replace(/\.$/, '').split('.').filter(Boolean).filter((label) => label !== '*').length;

/** RFC 4034 §6.1 canonical ordering of names. */
export function compareNames(a: string, b: string): number {
  const left = a.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean).reverse();
  const right = b.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean).reverse();
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const comparison = Buffer.compare(Buffer.from(left[i], 'latin1'), Buffer.from(right[i], 'latin1'));
    if (comparison) return comparison;
  }
  return left.length - right.length;
}

export function isSubdomain(name: string, zone: string): boolean {
  const n = name.toLowerCase().replace(/\.$/, ''), z = zone.toLowerCase().replace(/\.$/, '');
  return z === '' || n === z || n.endsWith(`.${z}`);
}

// ---- DNSKEY / DS ----
export interface Dnskey { readonly flags: number; readonly protocol: number; readonly algorithm: number; readonly key: Buffer; readonly keyTag: number; readonly rdata: Buffer }
export function parseDnskey(rdata: Buffer): Dnskey {
  if (rdata.length < 4) throw new Error('Truncated DNSKEY.');
  return { flags: rdata.readUInt16BE(0), protocol: rdata[2], algorithm: rdata[3], key: rdata.subarray(4), keyTag: keyTag(rdata), rdata };
}
/** RFC 4034 Appendix B. */
export function keyTag(rdata: Buffer): number {
  if (rdata[3] === 1) return rdata.readUInt16BE(rdata.length - 3);
  let accumulator = 0;
  for (let i = 0; i < rdata.length; i++) accumulator += i & 1 ? rdata[i] : rdata[i] << 8;
  accumulator += (accumulator >> 16) & 0xffff;
  return accumulator & 0xffff;
}
export interface Ds { readonly keyTag: number; readonly algorithm: number; readonly digestType: number; readonly digest: string }
export function parseDs(rdata: Buffer): Ds {
  return { keyTag: rdata.readUInt16BE(0), algorithm: rdata[2], digestType: rdata[3], digest: rdata.subarray(4).toString('hex').toUpperCase() };
}
export function dsDigest(owner: string, dnskeyRdata: Buffer, digestType: number): string | null {
  const digest = DIGESTS[digestType];
  if (!digest) return null;
  return createHash(digest.hash).update(Buffer.concat([canonicalName(owner), dnskeyRdata])).digest('hex').toUpperCase();
}
export function dsMatches(owner: string, key: Dnskey, ds: Ds): boolean {
  return ds.keyTag === key.keyTag && ds.algorithm === key.algorithm && dsDigest(owner, key.rdata, ds.digestType) === ds.digest;
}

const b64url = (data: Buffer) => data.toString('base64url');
export function dnskeyToKeyObject(key: Dnskey): KeyObject {
  const { algorithm } = key;
  if ([5, 7, 8, 10].includes(algorithm)) {
    let exponentLength = key.key[0], offset = 1;
    if (exponentLength === 0) { exponentLength = key.key.readUInt16BE(1); offset = 3; }
    const e = key.key.subarray(offset, offset + exponentLength);
    const n = key.key.subarray(offset + exponentLength);
    return createPublicKey({ key: { kty: 'RSA', n: b64url(n), e: b64url(e) }, format: 'jwk' });
  }
  if (algorithm === 13 || algorithm === 14) {
    const size = algorithm === 13 ? 32 : 48;
    if (key.key.length !== size * 2) throw new Error('Malformed ECDSA DNSKEY.');
    return createPublicKey({ key: { kty: 'EC', crv: algorithm === 13 ? 'P-256' : 'P-384', x: b64url(key.key.subarray(0, size)), y: b64url(key.key.subarray(size)) }, format: 'jwk' });
  }
  if (algorithm === 15 || algorithm === 16) return createPublicKey({ key: { kty: 'OKP', crv: algorithm === 15 ? 'Ed25519' : 'Ed448', x: b64url(key.key) }, format: 'jwk' });
  throw new Error(`DNSSEC algorithm ${algorithm} (${ALGORITHMS[algorithm]?.name ?? 'unknown'}) is not supported by this validator.`);
}

// ---- RRSIG ----
export interface Rrsig {
  readonly typeCovered: number; readonly algorithm: number; readonly labels: number; readonly originalTtl: number;
  readonly expiration: number; readonly inception: number; readonly keyTag: number; readonly signer: string;
  readonly signature: Buffer; readonly prefix: Buffer; readonly owner: string;
}
export function parseRrsig(record: Pick<DnsRecord, 'rdata' | 'name'>): Rrsig {
  const rdata = record.rdata;
  if (rdata.length < 19) throw new Error('Truncated RRSIG.');
  const labels: string[] = [];
  let at = 18;
  while (rdata[at] !== 0) {
    const length = rdata[at];
    if (length > 63 || at + 1 + length > rdata.length) throw new Error('Malformed RRSIG signer name.');
    labels.push(rdata.toString('latin1', at + 1, at + 1 + length));
    at += length + 1;
  }
  const signer = labels.join('.');
  return {
    typeCovered: rdata.readUInt16BE(0), algorithm: rdata[2], labels: rdata[3], originalTtl: rdata.readUInt32BE(4),
    expiration: rdata.readUInt32BE(8), inception: rdata.readUInt32BE(12), keyTag: rdata.readUInt16BE(16), signer,
    signature: rdata.subarray(at + 1), prefix: Buffer.concat([rdata.subarray(0, 18), canonicalName(signer)]), owner: record.name,
  };
}

/** Bytes an RRSIG signs (RFC 4034 §3.1.8.1), including wildcard owner reconstruction. */
export function signedData(sig: Rrsig, rrset: readonly Pick<DnsRecord, 'name' | 'typeCode' | 'class' | 'canonicalRdata'>[]): Buffer {
  const ownerLabels = sig.owner.replace(/\.$/, '').split('.').filter(Boolean);
  const owner = sig.labels < ownerLabels.length ? `*.${ownerLabels.slice(ownerLabels.length - sig.labels).join('.')}` : sig.owner;
  const ownerWire = canonicalName(owner);
  const unique = [...new Map(rrset.map((record) => [record.canonicalRdata.toString('hex'), record])).values()]
    .sort((a, b) => Buffer.compare(a.canonicalRdata, b.canonicalRdata));
  const parts = [sig.prefix];
  for (const record of unique) {
    const fixed = Buffer.alloc(10);
    fixed.writeUInt16BE(record.typeCode, 0); fixed.writeUInt16BE(record.class, 2); fixed.writeUInt32BE(sig.originalTtl, 4); fixed.writeUInt16BE(record.canonicalRdata.length, 8);
    parts.push(ownerWire, fixed, record.canonicalRdata);
  }
  return Buffer.concat(parts);
}

export interface SignatureCheck {
  readonly covered: string; readonly owner: string; readonly algorithm: number; readonly algorithmName: string; readonly keyTag: number; readonly signer: string;
  readonly inception: string; readonly expiration: string; readonly expiresInDays: number;
  readonly valid: boolean; readonly reason: string;
}

const dnssecDate = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Near expiry relative to the signing window, so short-lived online signatures don't raise noise. */
export function expiringSoon(check: Pick<SignatureCheck, 'inception' | 'expiration' | 'valid'>, now = Date.now()): boolean {
  if (!check.valid) return false;
  const start = Date.parse(check.inception), end = Date.parse(check.expiration);
  const remaining = end - now;
  return remaining < Math.min(3 * 86_400_000, (end - start) * 0.2);
}

export function verifyRrsig(sig: Rrsig, rrset: readonly DnsRecord[], keys: readonly Dnskey[], now = Date.now()): SignatureCheck {
  const base = {
    covered: typeName(sig.typeCovered), owner: sig.owner, algorithm: sig.algorithm, algorithmName: ALGORITHMS[sig.algorithm]?.name ?? `ALG${sig.algorithm}`,
    keyTag: sig.keyTag, signer: sig.signer, inception: dnssecDate(sig.inception), expiration: dnssecDate(sig.expiration),
    expiresInDays: Math.floor((sig.expiration * 1000 - now) / 86_400_000),
  };
  const seconds = Math.floor(now / 1000);
  if (seconds < sig.inception) return { ...base, valid: false, reason: 'Signature inception is in the future.' };
  if (seconds > sig.expiration) return { ...base, valid: false, reason: 'Signature has expired.' };
  const candidates = keys.filter((key) => key.keyTag === sig.keyTag && key.algorithm === sig.algorithm && key.protocol === 3 && (key.flags & 0x0100));
  if (!candidates.length) return { ...base, valid: false, reason: `No DNSKEY with key tag ${sig.keyTag} and algorithm ${sig.algorithm} is in the trusted key set.` };
  const data = signedData(sig, rrset);
  for (const key of candidates) {
    try {
      const keyObject = dnskeyToKeyObject(key);
      const hash = [5, 7].includes(sig.algorithm) ? 'sha1' : [8, 13].includes(sig.algorithm) ? 'sha256' : sig.algorithm === 14 ? 'sha384' : sig.algorithm === 10 ? 'sha512' : null;
      const ok = sig.algorithm === 13 || sig.algorithm === 14
        ? verify(hash, data, { key: keyObject, dsaEncoding: 'ieee-p1363' }, sig.signature)
        : verify(hash, data, keyObject, sig.signature);
      if (ok) return { ...base, valid: true, reason: 'Signature verifies.' };
    } catch (error) {
      return { ...base, valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  return { ...base, valid: false, reason: 'Signature does not verify with the matching DNSKEY.' };
}

/** Verify an RRset (records of `type` owned by `owner`) against its RRSIGs in `section`. */
export function verifyRrset(section: readonly DnsRecord[], owner: string, type: number, keys: readonly Dnskey[], now = Date.now()): { records: DnsRecord[]; checks: SignatureCheck[]; secure: boolean } {
  const records = section.filter((record) => record.typeCode === type && record.name.toLowerCase() === owner.toLowerCase());
  const sigs = section.filter((record) => record.typeCode === 46 && record.name.toLowerCase() === owner.toLowerCase()).map(parseRrsig).filter((sig) => sig.typeCovered === type);
  const checks = sigs.map((sig) => verifyRrsig(sig, records, keys, now));
  return { records, checks, secure: records.length > 0 && checks.some((check) => check.valid) };
}

// ---- Denial of existence ----
export function nsecTypes(rdata: Buffer, offset: number): Set<number> {
  const types = new Set<number>();
  for (let at = offset; at + 2 <= rdata.length;) {
    const window = rdata[at], length = rdata[at + 1];
    for (let i = 0; i < length; i++) for (let bit = 0; bit < 8; bit++) if (rdata[at + 2 + i] & (0x80 >> bit)) types.add(window * 256 + i * 8 + bit);
    at += 2 + length;
  }
  return types;
}
function nsecNext(rdata: Buffer): { next: string; bitmapOffset: number } {
  const labels: string[] = [];
  let at = 0;
  while (rdata[at] !== 0) { labels.push(rdata.toString('latin1', at + 1, at + 1 + rdata[at])); at += rdata[at] + 1; }
  return { next: labels.join('.'), bitmapOffset: at + 1 };
}
export interface Nsec3 { readonly hashAlgorithm: number; readonly flags: number; readonly iterations: number; readonly salt: Buffer; readonly nextHash: string; readonly types: Set<number>; readonly ownerHash: string; readonly zone: string }
export function parseNsec3(record: Pick<DnsRecord, 'rdata' | 'name'>): Nsec3 {
  const rdata = record.rdata;
  const saltLength = rdata[4];
  const salt = rdata.subarray(5, 5 + saltLength);
  const hashLength = rdata[5 + saltLength];
  const next = rdata.subarray(6 + saltLength, 6 + saltLength + hashLength);
  const [ownerHash, ...zone] = record.name.split('.');
  return { hashAlgorithm: rdata[0], flags: rdata[1], iterations: rdata.readUInt16BE(2), salt, nextHash: base32hex(next), types: nsecTypes(rdata, 6 + saltLength + hashLength), ownerHash: ownerHash.toUpperCase(), zone: zone.join('.') };
}
export function nsec3Hash(name: string, salt: Buffer, iterations: number): string {
  if (iterations > MAX_NSEC3_ITERATIONS) throw new Error(`NSEC3 iteration count ${iterations} exceeds the validator limit (${MAX_NSEC3_ITERATIONS}).`);
  let digest = createHash('sha1').update(Buffer.concat([canonicalName(name), salt])).digest();
  for (let i = 0; i < iterations; i++) digest = createHash('sha1').update(Buffer.concat([digest, salt])).digest();
  return base32hex(digest);
}
const covers = (owner: string, next: string, value: string) => owner < next ? owner < value && value < next : value > owner || value < next;

export interface DenialProof { readonly kind: 'NSEC' | 'NSEC3' | 'none'; readonly proven: boolean; readonly optOut: boolean; readonly nameExists: boolean | null; readonly typesAtName: readonly string[]; readonly detail: string; readonly signatures: readonly SignatureCheck[]; readonly iterations?: number }

/** Prove "no `type` at `name`" (NODATA) or "no such name" from the authority section, verifying the NSEC/NSEC3 RRSIGs with `keys`. */
export function proveDenial(authority: readonly DnsRecord[], name: string, type: number, keys: readonly Dnskey[], now = Date.now()): DenialProof {
  const nsecs = authority.filter((record) => record.typeCode === 47);
  const nsec3s = authority.filter((record) => record.typeCode === 50);
  const signatures: SignatureCheck[] = [];
  const signedOwners = (records: readonly DnsRecord[], code: number) => records.filter((record) => {
    const result = verifyRrset(authority, record.name, code, keys, now);
    signatures.push(...result.checks);
    return result.secure;
  });
  if (nsecs.length) {
    const valid = signedOwners([...new Map(nsecs.map((record) => [record.name.toLowerCase(), record])).values()], 47);
    const matching = valid.find((record) => record.name.toLowerCase() === name.toLowerCase());
    if (matching) {
      const { bitmapOffset } = nsecNext(matching.rdata);
      const types = nsecTypes(matching.rdata, bitmapOffset);
      const typesAtName = [...types].map(typeName);
      return { kind: 'NSEC', proven: !types.has(type) && !types.has(5), optOut: false, nameExists: true, typesAtName, detail: types.has(type) ? `NSEC at ${name} lists ${typeName(type)} — denial not proven.` : `NSEC at ${name} proves ${typeName(type)} does not exist (types present: ${typesAtName.join(' ')}).`, signatures };
    }
    const covering = valid.find((record) => compareNames(record.name, name) < 0 && (compareNames(name, nsecNext(record.rdata).next) < 0 || compareNames(nsecNext(record.rdata).next, record.name) <= 0));
    if (covering) return { kind: 'NSEC', proven: true, optOut: false, nameExists: false, typesAtName: [], detail: `NSEC ${covering.name} → ${nsecNext(covering.rdata).next} proves ${name} does not exist.`, signatures };
    return { kind: 'NSEC', proven: false, optOut: false, nameExists: null, typesAtName: [], detail: valid.length ? 'No NSEC record matches or covers the name.' : 'NSEC records present but none carry a valid signature.', signatures };
  }
  if (nsec3s.length) {
    const valid = signedOwners([...new Map(nsec3s.map((record) => [record.name.toLowerCase(), record])).values()], 50).map(parseNsec3);
    const params = valid[0];
    if (!params) return { kind: 'NSEC3', proven: false, optOut: false, nameExists: null, typesAtName: [], detail: 'NSEC3 records present but none carry a valid signature.', signatures };
    let hash: string;
    try { hash = nsec3Hash(name, params.salt, params.iterations); }
    catch (error) { return { kind: 'NSEC3', proven: false, optOut: false, nameExists: null, typesAtName: [], detail: error instanceof Error ? error.message : String(error), signatures, iterations: params.iterations }; }
    const matching = valid.find((entry) => entry.ownerHash === hash);
    if (matching) {
      const typesAtName = [...matching.types].map(typeName);
      return { kind: 'NSEC3', proven: !matching.types.has(type) && !matching.types.has(5), optOut: false, nameExists: true, typesAtName, detail: `NSEC3 hash ${hash} matches ${name}; ${typeName(type)} ${matching.types.has(type) ? 'is listed' : 'is absent'}.`, signatures, iterations: params.iterations };
    }
    const covering = valid.find((entry) => covers(entry.ownerHash, entry.nextHash, hash));
    if (covering) {
      const optOut = (covering.flags & 1) === 1;
      return { kind: 'NSEC3', proven: true, optOut, nameExists: false, typesAtName: [], detail: `NSEC3 ${covering.ownerHash} → ${covering.nextHash} covers ${hash}${optOut ? ' with opt-out: an unsigned delegation may exist here' : ''}.`, signatures, iterations: params.iterations };
    }
    return { kind: 'NSEC3', proven: false, optOut: false, nameExists: null, typesAtName: [], detail: `No NSEC3 record matches or covers hash ${hash}.`, signatures, iterations: params.iterations };
  }
  return { kind: 'none', proven: false, optOut: false, nameExists: null, typesAtName: [], detail: 'The response carried no NSEC or NSEC3 records.', signatures };
}

// ---- Chain walk ----
export interface KeyView { readonly keyTag: number; readonly algorithm: number; readonly algorithmName: string; readonly flags: number; readonly role: 'KSK' | 'ZSK' | 'other'; readonly revoked: boolean; readonly matchesParentDs: boolean; readonly bits?: number }
export interface DsView extends Ds { readonly digestName: string; readonly matchedKey: boolean }
export interface ZoneStep {
  readonly zone: string;
  readonly delegation: 'anchor' | 'secure' | 'insecure' | 'bogus';
  readonly ds: readonly DsView[];
  readonly dsSignatures: readonly SignatureCheck[];
  readonly keys: readonly KeyView[];
  readonly keySignatures: readonly SignatureCheck[];
  readonly denial?: DenialProof;
  readonly note: string;
}
export type DnssecStatus = 'secure' | 'insecure' | 'bogus' | 'indeterminate';
export interface DnssecResult {
  readonly target: string;
  readonly recordType: string;
  readonly resolver: string;
  readonly transport: DnsTransport;
  readonly contacted: string;
  readonly resolverAuthenticated: boolean;
  readonly resolverRcode: string;
  readonly status: DnssecStatus;
  readonly statusReason: string;
  readonly zones: readonly ZoneStep[];
  readonly answer: { readonly rcode: string; readonly records: readonly { name: string; type: string; ttl: number; value: string }[]; readonly signatures: readonly SignatureCheck[]; readonly denial?: DenialProof };
  readonly findings: readonly { id: string; status: 'pass' | 'warn' | 'fail' | 'info'; title: string; detail?: string; reference?: string }[];
  readonly queries: number;
}

function keyView(key: Dnskey, zone: string, parentDs: readonly Ds[]): KeyView {
  let bits: number | undefined;
  try { const details = dnskeyToKeyObject(key).asymmetricKeyDetails; bits = details?.modulusLength ?? (key.algorithm === 13 ? 256 : key.algorithm === 14 ? 384 : undefined); } catch { bits = undefined; }
  return {
    keyTag: key.keyTag, algorithm: key.algorithm, algorithmName: ALGORITHMS[key.algorithm]?.name ?? `ALG${key.algorithm}`, flags: key.flags,
    role: (key.flags & 0x0100) === 0 ? 'other' : key.flags & 1 ? 'KSK' : 'ZSK', revoked: (key.flags & 0x0080) !== 0,
    matchesParentDs: parentDs.some((ds) => dsMatches(zone, key, ds)), ...(bits ? { bits } : {}),
  };
}

const publicAnswer = (record: DnsRecord) => ({ name: record.name, type: record.type, ttl: record.ttl, value: record.value });

/** Raw DNS fetch seam: live by default, replayed from recorded packets in specs. */
export type DnssecFetch = (name: string, qtype: number, options: { dnssecOk: boolean; checkingDisabled: boolean }) => Promise<{ packet: Buffer; contacted: string }>;

export async function inspectDnssec(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void, now = Date.now(), fetch?: DnssecFetch): Promise<DnssecResult> {
  const target = (request.target ?? '').trim().replace(/\.$/, '').toLowerCase();
  const type = request.recordType ?? 'A';
  const typeCode = TYPE_CODES[type];
  const transport = request.resolverTransport ?? 'classic';
  const server = request.resolver || (transport === 'doh' ? 'https://cloudflare-dns.com/dns-query' : transport === 'dot' ? 'one.one.one.one' : 'system');
  let queries = 0;
  let contacted = '';
  const ask = async (name: string, qtype: number, options: { dnssecOk: boolean; checkingDisabled: boolean }): Promise<DnsMessage> => {
    if (signal.aborted) throw new Error('Cancelled.');
    if (++queries > MAX_QUERIES) throw new Error(`Query budget of ${MAX_QUERIES} exceeded.`);
    const fetcher: DnssecFetch = fetch ?? (async (qname, code, flags) => {
      const id = randomInt(0, 65536);
      const result = await exchange(server, transport, encodeQuery(qname, code, id, flags), id, signal, request.timeoutMs ?? 5000);
      return { packet: result.packet, contacted: result.diagnostics.contacted };
    });
    const { packet, contacted: host } = await fetcher(name, qtype, options);
    contacted = host;
    return decodeMessage(packet);
  };
  const findings: DnssecResult['findings'][number][] = [];
  const zones: ZoneStep[] = [];

  // What the resolver itself says (AD bit), for comparison with local validation.
  const plain = await ask(target, typeCode, { dnssecOk: true, checkingDisabled: false });
  const labels = target.split('.').filter(Boolean);
  const candidates = labels.map((_, index) => labels.slice(labels.length - 1 - index).join('.'));
  const total = candidates.length + 2;

  let zone = '';
  let trustedDs: Ds[] = ROOT_TRUST_ANCHORS.map(({ keyTag: tag, algorithm, digestType, digest }) => ({ keyTag: tag, algorithm, digestType, digest }));
  let delegation: ZoneStep['delegation'] = 'anchor';
  let dsSignatures: SignatureCheck[] = [];
  let status: DnssecStatus = 'indeterminate';
  let statusReason = '';
  let zoneKeys: Dnskey[] = [];
  let index = 0;

  const loadKeys = async (): Promise<boolean> => {
    const response = await ask(zone || '.', 48, { dnssecOk: true, checkingDisabled: true });
    const owner = zone || '';
    const keyRecords = response.answers.filter((record) => record.typeCode === 48 && record.name.toLowerCase() === owner);
    const keys = keyRecords.map((record) => parseDnskey(record.rdata));
    const anchors = keys.filter((key) => trustedDs.some((ds) => dsMatches(owner, key, ds)));
    const check = verifyRrset(response.answers, owner, 48, anchors, now);
    const dsViews: DsView[] = trustedDs.map((ds) => ({ ...ds, digestName: DIGESTS[ds.digestType]?.name ?? `type ${ds.digestType}`, matchedKey: keys.some((key) => dsMatches(owner, key, ds)) }));
    const secure = check.secure;
    zones.push({
      zone: zone || '.', delegation: secure ? delegation : 'bogus', ds: dsViews, dsSignatures, keys: keys.map((key) => keyView(key, owner, trustedDs)), keySignatures: check.checks,
      note: !keys.length ? `No DNSKEY RRset returned for ${zone || 'the root'} (${rcodeName(response.rcode)}).` : !anchors.length ? 'No DNSKEY matches the trusted DS / trust anchor.' : secure ? `DNSKEY RRset is signed by a key the ${zone ? 'parent DS' : 'root trust anchor'} vouches for.` : 'The DNSKEY RRset signature by the DS-matched key does not verify.',
    });
    for (const key of keys) {
      const algorithm = ALGORITHMS[key.algorithm];
      if (algorithm?.status === 'deprecated') findings.push({ id: `alg-${zone}-${key.keyTag}`, status: 'warn', title: `${zone || '.'}: key ${key.keyTag} uses deprecated ${algorithm.name}`, reference: 'RFC 8624 §3.1' });
      if (algorithm?.status === 'prohibited') findings.push({ id: `alg-${zone}-${key.keyTag}`, status: 'fail', title: `${zone || '.'}: key ${key.keyTag} uses prohibited ${algorithm.name}`, reference: 'RFC 8624 §3.1' });
    }
    for (const sig of check.checks) if (expiringSoon(sig, now)) findings.push({ id: `exp-${zone}-${sig.keyTag}`, status: 'warn', title: `${zone || '.'}: DNSKEY signature expires in ${sig.expiresInDays} day(s)`, detail: sig.expiration });
    zoneKeys = secure ? keys : [];
    return secure;
  };

  if (!(await loadKeys())) {
    status = 'bogus'; statusReason = 'The root DNSKEY RRset could not be validated against the IANA trust anchors.';
  } else {
    progress(++index, total);
    for (const child of candidates) {
      if (child === target && zone === target) break;
      const dsResponse = await ask(child, 43, { dnssecOk: true, checkingDisabled: true });
      progress(++index, total);
      const dsCheck = verifyRrset(dsResponse.answers, child, 43, zoneKeys, now);
      if (dsCheck.records.length) {
        dsSignatures = dsCheck.checks;
        if (!dsCheck.secure) { status = 'bogus'; statusReason = `The DS RRset for ${child} does not validate with ${zone || 'root'} keys.`; zones.push({ zone: child, delegation: 'bogus', ds: dsCheck.records.map((record) => ({ ...parseDs(record.rdata), digestName: DIGESTS[parseDs(record.rdata).digestType]?.name ?? '', matchedKey: false })), dsSignatures, keys: [], keySignatures: [], note: statusReason }); break; }
        trustedDs = dsCheck.records.map((record) => parseDs(record.rdata));
        for (const ds of trustedDs) if (DIGESTS[ds.digestType]?.status === 'deprecated') findings.push({ id: `ds-${child}-${ds.keyTag}`, status: 'warn', title: `${child}: DS ${ds.keyTag} uses SHA-1 digests`, reference: 'RFC 8624 §3.3' });
        zone = child; delegation = 'secure';
        if (!(await loadKeys())) { status = 'bogus'; statusReason = `No DNSKEY at ${child} matches its parent's DS, or its DNSKEY signature fails.`; break; }
        continue;
      }
      // No DS: is `child` a delegation (insecure) or just a name inside the current zone?
      const nsResponse = await ask(child, 2, { dnssecOk: true, checkingDisabled: true });
      const isCut = nsResponse.answers.some((record) => record.typeCode === 2 && record.name.toLowerCase() === child);
      if (nsResponse.rcode === 3) break;
      if (!isCut) continue;
      const denial = proveDenial(dsResponse.authority, child, 43, zoneKeys, now);
      zones.push({ zone: child, delegation: 'insecure', ds: [], dsSignatures: denial.signatures, keys: [], keySignatures: [], denial, note: denial.proven ? `The parent ${zone || 'root'} proves there is no DS for ${child}: the delegation is unsigned (insecure).` : `No DS for ${child}, and the absence could not be proven (${denial.detail}).` });
      if (denial.iterations && denial.iterations > 0) findings.push({ id: `nsec3-${zone}`, status: 'warn', title: `${zone || '.'}: NSEC3 uses ${denial.iterations} extra iterations`, detail: 'RFC 9276 recommends 0 iterations and an empty salt.', reference: 'RFC 9276 §3.1' });
      if (denial.proven) { status = 'insecure'; statusReason = `Unsigned delegation at ${child}${denial.optOut ? ' (NSEC3 opt-out)' : ''}.`; }
      else { status = 'bogus'; statusReason = `Missing DS for ${child} without a valid denial-of-existence proof.`; }
      break;
    }
  }

  // Final RRset.
  let answer: DnssecResult['answer'] = { rcode: rcodeName(plain.rcode), records: plain.answers.filter((record) => record.typeCode !== 46).map(publicAnswer), signatures: [] };
  if (status === 'indeterminate') {
    const response = await ask(target, typeCode, { dnssecOk: true, checkingDisabled: true });
    progress(total, total);
    // A CNAME chain can leave this zone; only RRsets within the validated zone are judged here.
    const allOwners = [...new Set(response.answers.filter((record) => record.typeCode !== 46).map((record) => record.name.toLowerCase()))];
    const owners = allOwners.filter((owner) => isSubdomain(owner, zone));
    for (const owner of allOwners.filter((name) => !owners.includes(name))) findings.push({ id: `oz-${owner}`, status: 'info', title: `${owner} is outside ${zone || 'the root'} (CNAME target) and was not validated in this walk.`, detail: 'Run the inspector on that name to validate its zone.' });
    const checks = owners.map((owner) => {
      const ownerType = response.answers.find((record) => record.name.toLowerCase() === owner && record.typeCode !== 46)!.typeCode;
      return verifyRrset(response.answers, owner, ownerType, zoneKeys, now);
    });
    const signatures = checks.flatMap((check) => check.checks);
    if (owners.length) {
      const secure = checks.every((check) => check.secure);
      status = secure ? 'secure' : 'bogus';
      statusReason = secure ? `Every RRset in the answer validates up to the root trust anchor through ${zone || 'the root'}.` : 'An RRset in the answer has no valid signature from the zone keys.';
      answer = { rcode: rcodeName(response.rcode), records: response.answers.filter((record) => record.typeCode !== 46).map(publicAnswer), signatures };
      for (const check of signatures) if (expiringSoon(check, now)) findings.push({ id: `exp-answer-${check.keyTag}`, status: 'warn', title: `Answer signature expires in ${check.expiresInDays} day(s)`, detail: check.expiration });
    } else {
      const denial = proveDenial(response.authority, target, typeCode, zoneKeys, now);
      status = denial.proven ? 'secure' : 'bogus';
      statusReason = denial.proven ? `Authenticated denial: ${denial.detail}` : `Negative answer without a valid denial proof: ${denial.detail}`;
      answer = { rcode: rcodeName(response.rcode), records: [], signatures: denial.signatures, denial };
      if (denial.iterations && denial.iterations > 0) findings.push({ id: 'nsec3-target', status: 'warn', title: `${zone}: NSEC3 uses ${denial.iterations} extra iterations`, reference: 'RFC 9276 §3.1' });
    }
  }
  if (plain.flags.ad && status !== 'secure') findings.push({ id: 'ad-mismatch', status: 'warn', title: 'The resolver set AD but local validation did not reach "secure".', detail: statusReason });
  if (!plain.flags.ad && status === 'secure') findings.push({ id: 'ad-missing', status: 'info', title: 'The resolver did not set AD (it may not validate), but local validation succeeded.' });
  if (plain.rcode === 2 && status === 'bogus') findings.push({ id: 'servfail', status: 'info', title: 'The validating resolver returned SERVFAIL, consistent with bogus data.' });
  findings.unshift({ id: 'status', status: status === 'secure' ? 'pass' : status === 'insecure' ? 'info' : status === 'bogus' ? 'fail' : 'warn', title: `DNSSEC status: ${status}`, detail: statusReason });
  return {
    target, recordType: type, resolver: server, transport, contacted, resolverAuthenticated: plain.flags.ad, resolverRcode: rcodeName(plain.rcode),
    status, statusReason, zones, answer, findings, queries,
  };
}
