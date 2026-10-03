import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CaKeyProtector } from './ca-key-protector.js';
import { localCaExists } from './ca-public.js';
import { createLeafIssuer } from './leaf-issuer.js';
import { createLocalCa, issueLeafFromCa } from './local-ca.js';
import { generateSelfSigned, spkiSha256 } from './self-signed.js';
import type { SelfSignedOptions, TlsIdentity } from './self-signed.js';
import { subjectAltNames } from './x509.js';

export interface LocalCaProvisioning {
  protector: CaKeyProtector;
  /** Operator DNS suffixes for a newly created CA. */
  suffixes?: readonly string[];
  /** Configured exposure names (host part) for a newly created CA's permitted subtrees. */
  configuredNames?: readonly string[];
}

export interface EnsureTlsIdentityOptions extends SelfSignedOptions {
  /** When set, a NEW Hub gets a built-in local CA and a CA-issued leaf (PD-058). Absent: a self-signed certificate. */
  localCa?: LocalCaProvisioning;
}

/** Create `key.pem`/`cert.pem` on first run (CA-issued when `localCa` is set), otherwise load them. */
export function ensureTlsIdentity(tlsDir: string, options: EnsureTlsIdentityOptions): TlsIdentity {
  const keyFile = path.join(tlsDir, 'key.pem');
  const certFile = path.join(tlsDir, 'cert.pem');
  if (existsSync(keyFile) && existsSync(certFile)) {
    const keyPem = readFileSync(keyFile, 'utf8');
    const certPem = readFileSync(certFile, 'utf8');
    return { keyPem, certPem, spkiSha256: spkiSha256(certPem) };
  }
  mkdirSync(tlsDir, { recursive: true });
  let issued: { keyPem: string; certPem: string };
  if (options.localCa === undefined) issued = generateSelfSigned(options);
  else if (localCaExists(tlsDir)) issued = createLeafIssuer(tlsDir, options.localCa.protector).issue({ hubInstanceId: options.hubInstanceId, ...(options.extraNames ? { extraNames: options.extraNames } : {}), ...(options.now ? { now: options.now } : {}) });
  else {
    const ca = createLocalCa({
      tlsDir, hubInstanceId: options.hubInstanceId, protector: options.localCa.protector,
      ...(options.localCa.suffixes ? { suffixes: options.localCa.suffixes } : {}),
      ...(options.localCa.configuredNames ? { configuredNames: options.localCa.configuredNames } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const leaf = issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: options.hubInstanceId, names: subjectAltNames(options.extraNames), ...(options.now ? { now: options.now } : {}) });
    issued = leaf;
  }
  const { keyPem, certPem } = issued;
  // On Windows the mode is advisory; the service installer applies ACLs.
  writeFileSync(keyFile, keyPem, { mode: 0o600 });
  writeFileSync(certFile, certPem);
  return { keyPem, certPem, spkiSha256: spkiSha256(certPem) };
}

