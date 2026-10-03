import { X509Certificate, createPrivateKey } from 'node:crypto';
import { isIP } from 'node:net';
import { canonicalSanName, certificateSubjectAltNames } from './names.js';
import { spkiSha256 } from './self-signed.js';

export const IMPORT_MIN_DAYS_LEFT = 7;
const SERVER_AUTH_OID = '1.3.6.1.5.5.7.3.1';
const ANY_EKU_OID = '2.5.29.37.0';
const DAY = 86_400_000;

export class ImportError extends Error {
  constructor(message: string, readonly missingNames: readonly string[] = []) {
    super(message);
  }
}

export interface ValidatedImport {
  keyPem: string;
  /** Leaf first, then the chain; what the Hub serves and stores as `next-cert.pem`. */
  certChainPem: string;
  spkiSha256: string;
  notAfter: string;
  subjectCn: string;
  warnings: string[];
}

/** Every PEM CERTIFICATE block in `text`, in order. */
export function parseCertificatePems(text: string): string[] {
  return [...text.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].map((m) => m[0].replace(/\r\n/g, '\n'));
}

const parseCert = (pem: string, what: string): X509Certificate => {
  try { return new X509Certificate(pem); } catch { throw new ImportError(`The ${what} is not a valid X.509 certificate.`); }
};

/** Whether the certificate names (canonical SAN entries) cover `name`: exact match, or a single-label `*.` DNS wildcard. */
export function sanCoversName(sans: readonly string[], name: string): boolean {
  const wanted = canonicalSanName(name);
  if (sans.includes(wanted)) return true;
  if (isIP(wanted) !== 0) return false;
  const dot = wanted.indexOf('.');
  if (dot <= 0) return false;
  const wildcard = `*${wanted.slice(dot)}`;
  // The wildcard must stand for exactly one non-empty leftmost label and the remainder must have at least two labels.
  return wildcard.indexOf('.', 2) > 0 && sans.includes(wildcard);
}

export function missingImportNames(certPem: string, required: readonly string[]): string[] {
  const sans = certificateSubjectAltNames(certPem);
  return required.filter((name) => !sanCoversName(sans, name));
}

export interface ValidateImportInput {
  certPem: string;
  keyPem: string;
  chainPem?: string;
  /** Names the Hub needs (configured names and the canonical origin host; built-ins excluded by the caller). */
  requiredNames: readonly string[];
  now?: number;
}

/** Validates an operator-supplied certificate, key and optional chain. Throws `ImportError` with an operator-facing message. */
export function validateImport(input: ValidateImportInput): ValidatedImport {
  const now = input.now ?? Date.now();
  const certs = parseCertificatePems(input.certPem);
  if (certs.length === 0) throw new ImportError('The certificate file contains no PEM certificate.');
  const leafPem = certs[0]!;
  const chainPems = [...certs.slice(1), ...(input.chainPem !== undefined ? parseCertificatePems(input.chainPem) : [])];
  if (input.chainPem !== undefined && parseCertificatePems(input.chainPem).length === 0) throw new ImportError('The chain file contains no PEM certificate.');
  const leaf = parseCert(leafPem, 'certificate');
  const chain = chainPems.map((pem, i) => parseCert(pem, `chain certificate ${i + 1}`));

  let key;
  try { key = createPrivateKey(input.keyPem); } catch { throw new ImportError('The private key could not be read (it must be an unencrypted PEM private key).'); }
  if (!leaf.checkPrivateKey(key)) throw new ImportError('The private key does not match the certificate.');

  if (now < new Date(leaf.validFrom).getTime()) throw new ImportError(`The certificate is not valid until ${new Date(leaf.validFrom).toISOString()}.`);
  const notAfter = new Date(leaf.validTo).getTime();
  if (now >= notAfter) throw new ImportError(`The certificate expired on ${new Date(notAfter).toISOString()}.`);
  if (notAfter - now < IMPORT_MIN_DAYS_LEFT * DAY) throw new ImportError(`The certificate expires within ${IMPORT_MIN_DAYS_LEFT} days (${new Date(notAfter).toISOString()}); import a longer-lived one.`);
  if (leaf.ca) throw new ImportError('The certificate is a certificate authority (cA:TRUE); import the server (leaf) certificate.');
  const eku = leaf.keyUsage;
  if (eku !== undefined && !eku.includes(SERVER_AUTH_OID) && !eku.includes(ANY_EKU_OID)) throw new ImportError('The certificate is not valid for server authentication (extended key usage lacks serverAuth).');

  const missing = missingImportNames(leafPem, input.requiredNames);
  if (missing.length > 0) {
    throw new ImportError(`The certificate does not cover: ${missing.join(', ')}. Every configured Hub name and the canonical origin host must be in its subject alternative names.`, missing);
  }

  const warnings: string[] = [];
  if (chain.length === 0) {
    warnings.push('No chain was supplied (--chain). Browsers that do not already know the issuing certificate may reject the Hub; devices pin the leaf and are unaffected.');
  } else {
    let previous = leaf;
    chain.forEach((cert, i) => {
      if (!previous.checkIssued(cert) || !previous.verify(cert.publicKey)) {
        throw new ImportError(i === 0 ? 'The first chain certificate did not issue the certificate.' : `Chain certificate ${i} was not issued by chain certificate ${i + 1}.`);
      }
      previous = cert;
    });
  }

  const cn = /CN=([^\n,]*)/.exec(leaf.subject)?.[1]?.trim() ?? '';
  return {
    keyPem: key.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certChainPem: [leafPem, ...chainPems].map((pem) => `${pem.trim()}\n`).join(''),
    spkiSha256: spkiSha256(leafPem),
    notAfter: new Date(notAfter).toISOString(),
    subjectCn: cn,
    warnings,
  };
}

