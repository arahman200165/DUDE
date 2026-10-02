/**
 * Pure certificate-bundle splitting, DN-based ordering heuristic, chain
 * signature verification, and bundle re-assembly for the Certificate Chain
 * Viewer & Builder. Built on the shared `x509-fields.ts` extractor.
 *
 * DN (subject/issuer) matching is used only as a fast pre-filter/ordering
 * hint in `linkChain` — `forge.pki.verifyCertificateChain` (real signature
 * verification against a CA store) is the source of truth in `verifyChain`,
 * per the Phase 12 plan.
 */

import forge from 'node-forge';
import { X509Fields, X509NameField, extractX509Fields } from "../../shared/utils/x509-fields.js";

export interface ChainEntry {
  readonly pem: string;
  readonly fields: X509Fields;
}

export type SplitBundleResult = { readonly ok: true; readonly entries: readonly ChainEntry[] } | { readonly ok: false; readonly error: string };

export function splitPemBundle(bundleText: string): SplitBundleResult {
  let messages: forge.pem.ObjectPEM[];
  try {
    messages = forge.pem.decode(bundleText);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to decode PEM.' };
  }

  const certMessages = messages.filter((m) => m.type === 'CERTIFICATE');
  if (certMessages.length === 0) return { ok: false, error: 'No CERTIFICATE blocks found in the bundle.' };

  const entries: ChainEntry[] = [];
  for (const message of certMessages) {
    try {
      const pem = forge.pem.encode(message);
      const cert = forge.pki.certificateFromPem(pem);
      entries.push({ pem, fields: extractX509Fields(cert) });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse a certificate block.' };
    }
  }
  return { ok: true, entries };
}

function dnKey(fields: readonly X509NameField[]): string {
  return fields
    .map((f) => `${(f.shortName || f.name).toLowerCase()}=${f.value}`)
    .sort()
    .join(',');
}

export interface LinkedChain {
  readonly ordered: readonly ChainEntry[];
  readonly warnings: readonly string[];
}

/** Orders a bag of certificates leaf-first by matching each cert's issuer DN to the next cert's subject DN. A heuristic, not a verification. */
export function linkChain(entries: readonly ChainEntry[]): LinkedChain {
  if (entries.length <= 1) return { ordered: entries, warnings: [] };

  const bySubject = new Map<string, ChainEntry>();
  for (const entry of entries) bySubject.set(dnKey(entry.fields.subject), entry);

  const issuerKeysInUse = new Set(entries.map((e) => dnKey(e.fields.issuer)));
  const leafCandidates = entries.filter((e) => !issuerKeysInUse.has(dnKey(e.fields.subject)));

  if (leafCandidates.length !== 1) {
    return {
      ordered: entries,
      warnings: ['Could not determine a unique leaf certificate by issuer/subject matching — keeping the original order.'],
    };
  }

  const ordered: ChainEntry[] = [leafCandidates[0]];
  const seen = new Set<ChainEntry>(ordered);
  const warnings: string[] = [];

  let current = leafCandidates[0];
  while (ordered.length < entries.length) {
    const issuerKey = dnKey(current.fields.issuer);
    if (issuerKey === dnKey(current.fields.subject)) break; // self-signed root reached

    const next = bySubject.get(issuerKey);
    if (!next || seen.has(next)) {
      warnings.push('Could not link the full chain by issuer/subject matching — some certificates may be missing or out of order.');
      break;
    }
    ordered.push(next);
    seen.add(next);
    current = next;
  }

  if (ordered.length < entries.length) {
    for (const entry of entries) if (!seen.has(entry)) ordered.push(entry);
  }

  return { ordered, warnings };
}

export interface ChainVerificationResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * Verifies `orderedPems` (leaf-first) as a signing chain, treating the last
 * entry as the trust anchor. Real signature verification via
 * `forge.pki.verifyCertificateChain` — DN matching plays no role here.
 */
export function verifyChain(orderedPems: readonly string[]): ChainVerificationResult {
  if (orderedPems.length < 2) return { ok: false, error: 'Need at least two certificates (leaf + at least one issuer) to verify a chain.' };

  let chain: forge.pki.Certificate[];
  try {
    chain = orderedPems.map((pem) => forge.pki.certificateFromPem(pem));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to parse a certificate in the chain.' };
  }

  try {
    const caStore = forge.pki.createCaStore([chain[chain.length - 1]]);
    const verified = forge.pki.verifyCertificateChain(caStore, chain);
    return { ok: verified === true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string } | null)?.message;
    return { ok: false, error: message ?? 'Chain verification failed.' };
  }
}

export function assembleBundle(orderedPems: readonly string[]): string {
  return orderedPems.map((pem) => pem.trim()).join('\n');
}
