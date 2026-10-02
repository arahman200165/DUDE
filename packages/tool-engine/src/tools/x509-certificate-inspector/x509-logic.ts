import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure X.509 certificate parsing for the Certificate Inspector, on top of
 * the shared `x509-fields.ts` extractor. Accepts PEM text, hex-encoded raw
 * DER, or an uploaded `.pem/.crt/.cer/.der` file, sniffing PEM vs. binary
 * DER via the `-----BEGIN` header — same pattern as `pem-der-logic.ts`.
 *
 * Fingerprints are computed with native `crypto.subtle.digest` over the raw
 * DER bytes, not node-forge's own hash implementations (per the Phase 12
 * plan's cross-cutting decision #2).
 */

import forge from 'node-forge';
import { hexToBytes } from "../../shared/utils/byte-codec.js";
import { X509Fields, extractX509Fields } from "../../shared/utils/x509-fields.js";

export interface ParsedCertificate {
  readonly fields: X509Fields;
  readonly der: Uint8Array;
  readonly fingerprintSha1: string;
  readonly fingerprintSha256: string;
}

export type ParseCertificateResult = { readonly ok: true; readonly certificate: ParsedCertificate } | { readonly ok: false; readonly error: string };

function looksLikePem(input: string): boolean {
  return /-----BEGIN [^-]+-----/.test(input);
}

async function toFingerprints(der: Uint8Array): Promise<{ sha1: string; sha256: string }> {
  const [sha1, sha256] = await Promise.all([
    hostCrypto().subtle.digest('SHA-1', der as BufferSource),
    hostCrypto().subtle.digest('SHA-256', der as BufferSource),
  ]);
  return { sha1: hexColon(new Uint8Array(sha1)), sha256: hexColon(new Uint8Array(sha256)) };
}

function hexColon(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(':');
}

async function fromCertificate(cert: forge.pki.Certificate, der: Uint8Array): Promise<ParsedCertificate> {
  const { sha1, sha256 } = await toFingerprints(der);
  return { fields: extractX509Fields(cert), der, fingerprintSha1: sha1, fingerprintSha256: sha256 };
}

export async function parseCertificateBytes(der: Uint8Array): Promise<ParseCertificateResult> {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(der));
    const cert = forge.pki.certificateFromAsn1(asn1);
    return { ok: true, certificate: await fromCertificate(cert, der) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse the DER certificate.' };
  }
}

export async function parseCertificateText(input: string): Promise<ParseCertificateResult> {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a PEM certificate, or hex-encoded DER bytes.' };

  if (looksLikePem(trimmed)) {
    try {
      const cert = forge.pki.certificateFromPem(trimmed);
      const der = forge.util.binary.raw.decode(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
      return { ok: true, certificate: await fromCertificate(cert, der) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse the PEM certificate.' };
    }
  }

  const hexResult = hexToBytes(trimmed);
  if (!hexResult.ok) return { ok: false, error: `Not a PEM certificate, and not valid hex either: ${hexResult.error}` };
  return parseCertificateBytes(hexResult.value);
}

export async function parseCertificateFile(bytes: Uint8Array): Promise<ParseCertificateResult> {
  let asText: string | null = null;
  try {
    asText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    asText = null;
  }
  if (asText !== null && looksLikePem(asText)) return parseCertificateText(asText);
  return parseCertificateBytes(bytes);
}
