import type { CaKeyProtector } from './ca-key-protector.js';
import { localCaExists, readCaCertPem } from './ca-public.js';
import { issueLeafFromCa, loadCaKey } from './local-ca.js';
import { generateSelfSigned } from './self-signed.js';
import { subjectAltNames } from './x509.js';
import type { TlsCertificateSource } from './ca-public.js';

export interface LeafIssueRequest {
  hubInstanceId: string;
  /** Extra names on top of the built-ins (localhost, host name, loopback). */
  extraNames?: readonly string[];
  now?: Date;
}

export interface LeafIssuer {
  readonly source: TlsCertificateSource;
  /** Always generates a NEW leaf key. Renewal (same key) lives in `renewal.ts`. */
  issue(request: LeafIssueRequest): { keyPem: string; certPem: string };
}

/** `local-ca` when `<tlsDir>/ca/ca-cert.pem` exists and a protector is available, otherwise `self-signed`. */
export function createLeafIssuer(tlsDir: string, protector?: CaKeyProtector): LeafIssuer {
  if (protector !== undefined && localCaExists(tlsDir)) {
    return {
      source: 'local-ca',
      issue: (request) => {
        const caCertPem = readCaCertPem(tlsDir)!;
        const { keyPem, certPem } = issueLeafFromCa({
          caCertPem, caKey: loadCaKey(tlsDir, protector), hubInstanceId: request.hubInstanceId, names: subjectAltNames(request.extraNames),
          ...(request.now ? { now: request.now } : {}),
        });
        return { keyPem, certPem };
      },
    };
  }
  return {
    source: 'self-signed',
    issue: (request) => generateSelfSigned({ hubInstanceId: request.hubInstanceId, ...(request.extraNames ? { extraNames: request.extraNames } : {}), ...(request.now ? { now: request.now } : {}) }),
  };
}
