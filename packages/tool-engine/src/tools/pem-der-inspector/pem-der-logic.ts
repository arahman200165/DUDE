/**
 * Pure PEM/DER parsing and conversion for the PEM / DER Inspector &
 * Converter tool. Builds on the shared `asn1-tree.ts` translator (the
 * load-bearing piece other Phase 12 milestones reuse) and `node-forge`'s
 * `pem`/`asn1` modules.
 *
 * Per the repo's ArrayBuffer<->forge-buffer convention, conversions always
 * go through `forge.util.binary.raw.encode`/`decode` — never a
 * `String.fromCharCode(...bytes)` spread (stack-overflow risk on larger
 * blobs).
 */

import forge from 'node-forge';
import { Asn1TreeNode, buildAsn1Tree } from "../../shared/utils/asn1-tree.js";
import { hexToBytes } from "../../shared/utils/byte-codec.js";

export interface PemBlockResult {
  readonly type: string;
  readonly der: Uint8Array;
  readonly tree: Asn1TreeNode;
}

export type ParseResult =
  | { readonly ok: true; readonly kind: 'pem'; readonly blocks: readonly PemBlockResult[] }
  | { readonly ok: true; readonly kind: 'der'; readonly der: Uint8Array; readonly tree: Asn1TreeNode }
  | { readonly ok: false; readonly error: string };

export const COMMON_PEM_TYPES: readonly string[] = [
  'CERTIFICATE',
  'CERTIFICATE REQUEST',
  'PRIVATE KEY',
  'ENCRYPTED PRIVATE KEY',
  'RSA PRIVATE KEY',
  'EC PRIVATE KEY',
  'PUBLIC KEY',
  'X509 CRL',
];

function looksLikePem(input: string): boolean {
  return /-----BEGIN [^-]+-----/.test(input);
}

export function parsePemText(pemText: string): ParseResult {
  let messages: forge.pem.ObjectPEM[];
  try {
    messages = forge.pem.decode(pemText);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to decode PEM.' };
  }
  if (messages.length === 0) return { ok: false, error: 'No PEM blocks found (expected a "-----BEGIN ...-----" block).' };

  const blocks: PemBlockResult[] = [];
  for (const message of messages) {
    try {
      const asn1 = forge.asn1.fromDer(message.body);
      blocks.push({ type: message.type, der: forge.util.binary.raw.decode(message.body), tree: buildAsn1Tree(asn1) });
    } catch (error) {
      return { ok: false, error: `Block "${message.type}": ${error instanceof Error ? error.message : 'invalid DER content.'}` };
    }
  }
  return { ok: true, kind: 'pem', blocks };
}

export function parseDerBytes(der: Uint8Array): ParseResult {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(der));
    return { ok: true, kind: 'der', der, tree: buildAsn1Tree(asn1) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse DER bytes.' };
  }
}

/** Auto-detects PEM text vs. hex-encoded raw DER pasted as text. */
export function parsePemOrHexDer(input: string): ParseResult {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a PEM block, or hex-encoded DER bytes.' };

  if (looksLikePem(trimmed)) return parsePemText(trimmed);

  const hexResult = hexToBytes(trimmed);
  if (!hexResult.ok) return { ok: false, error: `Not a PEM block, and not valid hex either: ${hexResult.error}` };
  return parseDerBytes(hexResult.value);
}

/** Auto-detects a PEM text file vs. a raw binary DER file. */
export function parsePemOrDerFile(bytes: Uint8Array): ParseResult {
  let asText: string | null = null;
  try {
    asText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    asText = null;
  }
  if (asText !== null && looksLikePem(asText)) return parsePemText(asText);
  return parseDerBytes(bytes);
}

export function derToPem(der: Uint8Array, type: string): string {
  return forge.pem.encode({ type, body: forge.util.binary.raw.encode(der) });
}
