import { X509Certificate, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isIPv6 } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { bitString, boolean, contextExplicit, contextImplicit, integer, integerFromNumber, octetString, oid, sequence, set, utf8String, x509Time } from './der-writer.js';

const OID = {
  commonName: '2.5.4.3',
  ecdsaWithSha256: '1.2.840.10045.4.3.2',
  ecPublicKey: '1.2.840.10045.2.1',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
  subjectAltName: '2.5.29.17',
  subjectKeyIdentifier: '2.5.29.14',
} as const;

export interface SelfSignedOptions {
  hubInstanceId: string;
  /** Extra DNS names or IP literals added to the SAN list. */
  extraNames?: readonly string[];
  now?: Date;
  validityYears?: number;
}

export interface TlsIdentity {
  keyPem: string;
  certPem: string;
  spkiSha256: string;
}

const extension = (id: string, critical: boolean, value: Buffer): Buffer =>
  sequence(oid(id), ...(critical ? [boolean(true)] : []), octetString(value));

function ipBytes(address: string): Buffer {
  if (!isIPv6(address)) return Buffer.from(address.split('.').map(Number));
  const [head, tail = ''] = address.split('::');
  const parse = (part: string): number[] => (part ? part.split(':').flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 0xff]) : []);
  const left = parse(head);
  const right = address.includes('::') ? parse(tail) : [];
  return Buffer.from([...left, ...new Array(16 - left.length - right.length).fill(0), ...right]);
}

function generalName(name: string): Buffer {
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || isIPv6(name);
  return isIp ? contextImplicit(7, ipBytes(name)) : contextImplicit(2, Buffer.from(name, 'ascii'));
}

/** Names always present in the SAN list, plus caller extras, de-duplicated. */
export function subjectAltNames(extra: readonly string[] = []): string[] {
  return [...new Set(['localhost', os.hostname(), '127.0.0.1', '::1', ...extra])];
}

export function spkiSha256(source: string | Buffer | KeyObject | X509Certificate): string {
  let key: KeyObject;
  if (source instanceof X509Certificate) key = source.publicKey;
  else if (typeof source === 'string' || Buffer.isBuffer(source)) {
    const text = source.toString();
    key = text.includes('PRIVATE KEY') ? createPublicKey(createPrivateKey(text)) : text.includes('BEGIN CERTIFICATE') ? new X509Certificate(text).publicKey : createPublicKey(text);
  } else key = source.type === 'private' ? createPublicKey(source) : source;
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('base64url');
}

/** Generate a self-signed ECDSA P-256 server certificate (PEM key and cert). */
export function generateSelfSigned(options: SelfSignedOptions): { keyPem: string; certPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const now = options.now ?? new Date();
  const notBefore = new Date(now.getTime() - 3600_000);
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + (options.validityYears ?? 10));

  const serial = randomBytes(16);
  serial[0] &= 0x7f; // keep it positive
  if (serial[0] === 0) serial[0] = 1;

  // SubjectKeyIdentifier: SHA-1 of the subjectPublicKey (the uncompressed EC point, last 65 bytes of the SPKI).
  const ski = createHash('sha1').update(spki.subarray(spki.length - 65)).digest();
  // The subject is unique per key: during a rotation clients trust the active and the next certificate at once, and
  // OpenSSL (on Linux) fails a self-signed leaf with DEPTH_ZERO_SELF_SIGNED_CERT when two trust anchors share its name.
  const name = sequence(set(sequence(oid(OID.commonName), utf8String(`DUDE Hub ${options.hubInstanceId.slice(0, 8)} ${ski.subarray(0, 4).toString('hex')}`))));
  const sigAlg = sequence(oid(OID.ecdsaWithSha256));
  const sanList = sequence(...subjectAltNames(options.extraNames).map(generalName));

  const extensions = sequence(
    extension(OID.basicConstraints, true, sequence()),
    extension(OID.keyUsage, true, bitString(Buffer.from([0x80]), 7)),
    extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
    extension(OID.subjectAltName, false, sanList),
    extension(OID.subjectKeyIdentifier, false, octetString(ski)),
  );

  const tbs = sequence(
    contextExplicit(0, integerFromNumber(2)),
    integer(serial),
    sigAlg,
    name,
    sequence(x509Time(notBefore), x509Time(notAfter)),
    name,
    spki,
    contextExplicit(3, extensions),
  );
  const signature = sign('sha256', tbs, privateKey);
  const certDer = sequence(tbs, sigAlg, bitString(signature));
  const certPem = `-----BEGIN CERTIFICATE-----\n${certDer.toString('base64').replace(/(.{64})/g, '$1\n').trimEnd()}\n-----END CERTIFICATE-----\n`;
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { keyPem, certPem };
}

/** Create `key.pem`/`cert.pem` on first run, otherwise load them. */
export function ensureTlsIdentity(tlsDir: string, options: SelfSignedOptions): TlsIdentity {
  const keyFile = path.join(tlsDir, 'key.pem');
  const certFile = path.join(tlsDir, 'cert.pem');
  if (existsSync(keyFile) && existsSync(certFile)) {
    const keyPem = readFileSync(keyFile, 'utf8');
    const certPem = readFileSync(certFile, 'utf8');
    return { keyPem, certPem, spkiSha256: spkiSha256(certPem) };
  }
  mkdirSync(tlsDir, { recursive: true });
  const { keyPem, certPem } = generateSelfSigned(options);
  // On Windows the mode is advisory; the service installer applies ACLs.
  writeFileSync(keyFile, keyPem, { mode: 0o600 });
  writeFileSync(certFile, certPem);
  return { keyPem, certPem, spkiSha256: spkiSha256(certPem) };
}
