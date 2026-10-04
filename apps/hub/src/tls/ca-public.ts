import { X509Certificate, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OID, certificateExtensions, parseNameConstraints, skiOfKey } from './x509.js';
import type { ParsedNameConstraints } from './x509.js';

/**
 * PUBLIC local-CA helpers: nothing here can read the CA private key, so request handlers may import this module.
 */
export const CA_DIR = 'ca';
export const CA_CERT_FILE = 'ca-cert.pem';

export type TlsCertificateSource = 'self-signed' | 'local-ca' | 'imported' | 'acme';

export const caDir = (tlsDir: string): string => path.join(tlsDir, CA_DIR);
export const caCertFile = (tlsDir: string): string => path.join(caDir(tlsDir), CA_CERT_FILE);
export const localCaExists = (tlsDir: string): boolean => existsSync(caCertFile(tlsDir));
export const readCaCertPem = (tlsDir: string): string | null => (localCaExists(tlsDir) ? readFileSync(caCertFile(tlsDir), 'utf8') : null);

/** Whether `leafPem` was issued (name, key identifier and signature) by the CA in `caPem`. */
export function isIssuedByCa(leafPem: string, caPem: string): boolean {
  try {
    const leaf = new X509Certificate(leafPem);
    const ca = new X509Certificate(caPem);
    return leaf.checkIssued(ca) && leaf.verify(ca.publicKey);
  } catch {
    return false;
  }
}

/** The certificate source of the active leaf: `local-ca` only when the local CA exists and really issued it. */
export function describeCertificateSource(tlsDir: string, activeCertPem: string): { source: TlsCertificateSource; caCertPem: string | null } {
  const caCertPem = readCaCertPem(tlsDir);
  return { source: caCertPem !== null && isIssuedByCa(activeCertPem, caCertPem) ? 'local-ca' : 'self-signed', caCertPem };
}

export const rootSha256 = (caPem: string): string => createHash('sha256').update(new X509Certificate(caPem).raw).digest('hex');

export function caNameConstraints(caPem: string): ParsedNameConstraints {
  const ext = certificateExtensions(new X509Certificate(caPem).raw).find((e) => e.oid === OID.nameConstraints);
  if (!ext) throw new Error('The local CA certificate has no name constraints.');
  return parseNameConstraints(ext.value);
}

export const caSubjectKeyIdentifier = (caPem: string): Buffer => skiOfKey(new X509Certificate(caPem).publicKey);

export interface LocalCaStatus {
  rootSha256: string;
  notBefore: string;
  notAfter: string;
  subject: string;
  permittedDns: string[];
  permittedIps: string[];
  activeLeafIssuedByCa: boolean | null;
  leafNotAfter: string | null;
}

export function localCaStatus(tlsDir: string): LocalCaStatus | null {
  const caPem = readCaCertPem(tlsDir);
  if (caPem === null) return null;
  const ca = new X509Certificate(caPem);
  const constraints = caNameConstraints(caPem);
  const leafFile = path.join(tlsDir, 'cert.pem');
  const leafPem = existsSync(leafFile) ? readFileSync(leafFile, 'utf8') : null;
  return {
    rootSha256: rootSha256(caPem),
    notBefore: new Date(ca.validFrom).toISOString(),
    notAfter: new Date(ca.validTo).toISOString(),
    subject: ca.subject.replace(/^CN=/, ''),
    permittedDns: constraints.permittedDns,
    permittedIps: constraints.permittedIps.map((s) => `${s.address}/${s.prefix}`),
    activeLeafIssuedByCa: leafPem === null ? null : isIssuedByCa(leafPem, caPem),
    leafNotAfter: leafPem === null ? null : new Date(new X509Certificate(leafPem).validTo).toISOString(),
  };
}
