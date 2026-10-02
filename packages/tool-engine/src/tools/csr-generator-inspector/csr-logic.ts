/**
 * Pure CSR (PKCS#10) generation and inspection via `node-forge`. Scoped to
 * RSA keys: `node-forge`'s `pki`/CSR/certificate APIs only model RSA (and,
 * separately, Ed25519 verification) — there is no EC/ECDSA CSR-signing
 * support in the library, so this tool intentionally does not offer it.
 *
 * Key generation for a *new* CSR happens elsewhere, via
 * `../asymmetric-key-generator/asymmetric-keygen-logic.ts`'s fast, native
 * `jose`-based RSA keygen — never `forge.pki.rsa.generateKeyPair` (pure-JS
 * bignum modexp, genuinely CPU-bound for RSA-2048+). `forge.pki.privateKeyFromPem`
 * accepts that PKCS8 output directly: it auto-unwraps the PrivateKeyInfo
 * wrapper before validating the inner RSAPrivateKey structure.
 */

import forge from 'node-forge';
import { oidName } from "../../shared/utils/asn1-tree.js";

export const CSR_SUBJECT_SHORT_NAMES = ['CN', 'O', 'OU', 'L', 'ST', 'C', 'E'] as const;
export type CsrSubjectShortName = (typeof CSR_SUBJECT_SHORT_NAMES)[number];

export const CSR_SUBJECT_FIELD_LABELS: Record<CsrSubjectShortName, string> = {
  CN: 'Common Name',
  O: 'Organization',
  OU: 'Organizational Unit',
  L: 'Locality',
  ST: 'State / Province',
  C: 'Country',
  E: 'Email Address',
};

export interface CsrSubjectField {
  readonly shortName: CsrSubjectShortName;
  readonly value: string;
}

export type GenerateCsrResult = { readonly ok: true; readonly csrPem: string } | { readonly ok: false; readonly error: string };

function hasRsaModulus(key: unknown): key is { readonly n: forge.jsbn.BigInteger; readonly e: forge.jsbn.BigInteger } {
  return typeof key === 'object' && key !== null && 'n' in key && 'e' in key;
}

export function generateCsr(subjectFields: readonly CsrSubjectField[], privateKeyPem: string): GenerateCsrResult {
  const fields = subjectFields.filter((f) => f.value.trim() !== '');
  if (fields.length === 0) return { ok: false, error: 'Enter at least one subject field (e.g. Common Name).' };

  let privateKey: forge.pki.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  } catch (error) {
    return { ok: false, error: `Could not read the private key: ${error instanceof Error ? error.message : 'invalid PEM.'}` };
  }
  if (!hasRsaModulus(privateKey)) {
    return { ok: false, error: 'Only RSA private keys are supported for CSR signing (node-forge has no EC/Ed25519 CSR support).' };
  }

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);
  csr.setSubject(fields.map((f) => ({ shortName: f.shortName, value: f.value })));

  try {
    csr.sign(privateKey as forge.pki.rsa.PrivateKey, forge.md.sha256.create());
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to sign the CSR.' };
  }

  return { ok: true, csrPem: forge.pki.certificationRequestToPem(csr) };
}

export interface InspectedCsrField {
  readonly shortName: string;
  readonly name: string;
  readonly value: string;
}

export interface InspectedCsr {
  readonly subject: readonly InspectedCsrField[];
  readonly publicKeyBits: number | null;
  readonly signatureAlgorithm: string;
  readonly signatureValid: boolean;
}

export type InspectCsrResult = { readonly ok: true; readonly csr: InspectedCsr } | { readonly ok: false; readonly error: string };

export function inspectCsr(pem: string): InspectCsrResult {
  let csr: forge.pki.CertificateSigningRequest;
  try {
    csr = forge.pki.certificationRequestFromPem(pem);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse the CSR PEM.' };
  }

  let signatureValid: boolean;
  try {
    signatureValid = csr.verify();
  } catch {
    signatureValid = false;
  }

  const publicKeyBits = hasRsaModulus(csr.publicKey) ? csr.publicKey.n.bitLength() : null;

  return {
    ok: true,
    csr: {
      subject: csr.subject.attributes.map((attr) => ({
        shortName: attr.shortName ?? '',
        name: attr.name ?? '',
        value: typeof attr.value === 'string' ? attr.value : String(attr.value ?? ''),
      })),
      publicKeyBits,
      signatureAlgorithm: oidName(csr.signatureOid ?? ''),
      signatureValid,
    },
  };
}
