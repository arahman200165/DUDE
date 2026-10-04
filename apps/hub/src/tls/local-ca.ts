import { X509Certificate, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { octetString, oid, sequence } from './der-writer.js';
import { caCertFile, caDir, caNameConstraints, localCaExists, rootSha256 } from './ca-public.js';
import type { CaKeyProtector } from './ca-key-protector.js';
import {
  KEY_USAGE, OID, authorityKeyIdentifierValue, basicConstraintsValue, buildCertificate, extension, generalName, isIpLiteral, isNamePermitted,
  keyUsageValue, nameConstraintsValue, pemEncode, skiFromSpki, skiOfKey,
} from './x509.js';
import type { IpSubtree } from './x509.js';

/**
 * The built-in local CA (PD-058). This module can unprotect the CA private key, so only the admin-pipe CA commands and
 * the renewal job use it; request handlers never import it (`local-ca.spec.ts` enforces that).
 */
export const CA_VALIDITY_YEARS = 10;
export const LEAF_VALIDITY_DAYS = 397;
export const MAX_CA_SUFFIXES = 8;

export const CA_PERMITTED_DNS = ['local', 'internal', 'lan', 'home.arpa', 'localhost'] as const;
export const CA_PERMITTED_IPS: readonly IpSubtree[] = [
  { address: '10.0.0.0', prefix: 8 },
  { address: '172.16.0.0', prefix: 12 },
  { address: '192.168.0.0', prefix: 16 },
  { address: '100.64.0.0', prefix: 10 },
  { address: '127.0.0.0', prefix: 8 },
  { address: '169.254.0.0', prefix: 16 },
  { address: '::1', prefix: 128 },
  { address: 'fc00::', prefix: 7 },
  { address: 'fe80::', prefix: 10 },
];

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Validates and lowercases operator DNS suffixes (`--suffix`); throws on bad syntax or more than 8. */
export function validateCaSuffixes(suffixes: readonly string[]): string[] {
  const out = [...new Set(suffixes.map((s) => s.trim().toLowerCase().replace(/\.$/, '')))];
  if (out.length > MAX_CA_SUFFIXES) throw new Error(`At most ${MAX_CA_SUFFIXES} --suffix values are allowed.`);
  for (const suffix of out) {
    if (suffix.length === 0 || suffix.length > 253 || isIpLiteral(suffix) || !suffix.split('.').every((label) => DNS_LABEL.test(label))) {
      throw new Error(`"${suffix}" is not a valid DNS suffix.`);
    }
  }
  return out;
}

export interface CreateLocalCaInput {
  tlsDir: string;
  hubInstanceId: string;
  protector: CaKeyProtector;
  /** Operator DNS suffixes (`tls ca init --suffix`). */
  suffixes?: readonly string[];
  /** Configured exposure names (host part); only DNS names are added to the permitted subtrees. */
  configuredNames?: readonly string[];
  hostname?: string;
  now?: Date;
}

export interface LocalCa {
  caCertPem: string;
  caKey: KeyObject;
  rootSha256: string;
  permittedDns: string[];
}

/** Creates `<tlsDir>/ca/` with the root certificate and the protected key. The permitted set is fixed here, once. */
export function createLocalCa(input: CreateLocalCaInput): LocalCa {
  if (localCaExists(input.tlsDir)) throw new Error('The local CA already exists.');
  const suffixes = validateCaSuffixes(input.suffixes ?? []);
  const configured = (input.configuredNames ?? []).filter((name) => !isIpLiteral(name)).map((name) => name.toLowerCase());
  const permittedDns = [...new Set<string>([...CA_PERMITTED_DNS, (input.hostname ?? os.hostname()).toLowerCase(), ...suffixes, ...configured])];

  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const ski = skiFromSpki(spki);
  const now = input.now ?? new Date();
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + CA_VALIDITY_YEARS);
  const cn = `DUDE Hub Local CA ${input.hubInstanceId.slice(0, 8)} ${ski.subarray(0, 2).toString('hex')}`;
  const der = buildCertificate({
    subjectCn: cn,
    issuerCn: cn,
    spki,
    notBefore: new Date(now.getTime() - 3600_000),
    notAfter,
    signerKey: privateKey,
    extensions: [
      extension(OID.basicConstraints, true, basicConstraintsValue(true, 0)),
      extension(OID.keyUsage, true, keyUsageValue([KEY_USAGE.keyCertSign, KEY_USAGE.cRLSign])),
      extension(OID.subjectKeyIdentifier, false, octetString(ski)),
      extension(OID.nameConstraints, true, nameConstraintsValue(permittedDns, CA_PERMITTED_IPS)),
    ],
  });
  const caCertPem = pemEncode('CERTIFICATE', der);
  const dir = caDir(input.tlsDir);
  mkdirSync(dir, { recursive: true });
  // The key is written first: a certificate without a usable key must never mark the CA as existing.
  writeFileSync(path.join(dir, input.protector.keyFile), input.protector.protect(Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'utf8')), { mode: 0o600 });
  writeFileSync(caCertFile(input.tlsDir), caCertPem);
  return { caCertPem, caKey: privateKey, rootSha256: rootSha256(caCertPem), permittedDns };
}

/** Unprotects and loads the CA private key. Key-use boundary: admin-pipe CA commands and the renewal job only. */
export function loadCaKey(tlsDir: string, protector: CaKeyProtector): KeyObject {
  const blob = readFileSync(path.join(caDir(tlsDir), protector.keyFile));
  return createPrivateKey(protector.unprotect(blob).toString('utf8'));
}

export interface IssueLeafInput {
  caCertPem: string;
  caKey: KeyObject;
  hubInstanceId: string;
  /** The wanted SAN set (DNS names and IP literals). */
  names: readonly string[];
  now?: Date;
  /** Re-certify this key (renewal) instead of generating a new one. */
  leafKeyPem?: string;
}

export interface IssuedLeaf { keyPem: string; certPem: string; skippedNames: string[] }

/**
 * Issues a CA-signed server leaf. DNS names outside the CA name constraints are a hard error (the operator asked for
 * them); IP addresses outside them (e.g. a global IPv6 interface address) are left out and reported in `skippedNames`.
 */
/** A configured name the local CA may not certify; safe to show the operator verbatim (the admin channel maps it to a bad-request). */
export class CaNameConstraintError extends Error {
  readonly adminSafe = true;
}

export function issueLeafFromCa(input: IssueLeafInput): IssuedLeaf {
  const ca = new X509Certificate(input.caCertPem);
  const constraints = caNameConstraints(input.caCertPem);
  const names: string[] = [];
  const skippedNames: string[] = [];
  for (const name of input.names) {
    if (isNamePermitted(constraints, name)) names.push(name);
    else if (isIpLiteral(name)) skippedNames.push(name);
    else throw new CaNameConstraintError(`"${name}" is outside the local CA's name constraints (${constraints.permittedDns.join(', ')}). Create the Hub CA with a matching --suffix, or use an imported certificate.`);
  }
  const privateKey = input.leafKeyPem !== undefined ? createPrivateKey(input.leafKeyPem) : generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
  const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const ski = skiFromSpki(spki);
  const now = input.now ?? new Date();
  const caCn = ca.subject.replace(/^CN=/, '');
  const der = buildCertificate({
    subjectCn: `DUDE Hub ${input.hubInstanceId.slice(0, 8)} ${ski.subarray(0, 4).toString('hex')}`,
    issuerCn: caCn,
    spki,
    notBefore: new Date(now.getTime() - 3600_000),
    notAfter: new Date(now.getTime() + LEAF_VALIDITY_DAYS * 86_400_000),
    signerKey: input.caKey,
    extensions: [
      extension(OID.basicConstraints, true, basicConstraintsValue(false)),
      extension(OID.keyUsage, true, keyUsageValue([KEY_USAGE.digitalSignature])),
      extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
      extension(OID.subjectAltName, false, sequence(...names.map(generalName))),
      extension(OID.subjectKeyIdentifier, false, octetString(ski)),
      extension(OID.authorityKeyIdentifier, false, authorityKeyIdentifierValue(skiOfKey(ca.publicKey))),
    ],
  });
  return { keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), certPem: pemEncode('CERTIFICATE', der), skippedNames };
}

