/**
 * Pure PKCS#12/PFX inspection via `node-forge`. Enumerates bags through the
 * documented `p12.getBags({bagType})` API rather than manually walking
 * `safeContents` (per the Phase 12 plan). Verified against a real
 * `openssl pkcs12 -export`-generated file using OpenSSL 3.x's modern
 * defaults (PBES2/PBKDF2/AES-256-CBC) — node-forge's PBE decryption (shared
 * with encrypted-PKCS8 support) handles it without needing `-legacy` mode.
 */

import forge from 'node-forge';
import { X509Fields, extractX509Fields } from "../../shared/utils/x509-fields.js";

export interface Pkcs12Certificate {
  readonly fields: X509Fields;
  readonly pem: string;
  readonly friendlyName: string | null;
}

export interface Pkcs12PrivateKey {
  readonly pem: string;
  readonly bits: number | null;
  readonly friendlyName: string | null;
}

export interface Pkcs12Contents {
  readonly certificates: readonly Pkcs12Certificate[];
  readonly privateKeys: readonly Pkcs12PrivateKey[];
}

export type InspectPkcs12Result = { readonly ok: true; readonly contents: Pkcs12Contents } | { readonly ok: false; readonly error: string };

function friendlyNameOf(bag: forge.pkcs12.Bag): string | null {
  const names = (bag.attributes as Record<string, unknown> | undefined)?.['friendlyName'];
  return Array.isArray(names) && names.length > 0 ? String(names[0]) : null;
}

function hasRsaModulus(key: unknown): key is { readonly n: forge.jsbn.BigInteger } {
  return typeof key === 'object' && key !== null && 'n' in key;
}

export function inspectPkcs12(bytes: Uint8Array, password: string): InspectPkcs12Result {
  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(forge.util.binary.raw.encode(bytes));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Not a valid PKCS#12/PFX file (could not parse ASN.1).' };
  }

  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/mac|invalid password/i.test(message)) {
      return { ok: false, error: 'Wrong password (or the file is corrupt) — the integrity MAC check failed.' };
    }
    return { ok: false, error: `Failed to decrypt/parse the PKCS#12 file: ${message}` };
  }

  const certBagType = forge.pki.oids['certBag'];
  const keyBagType = forge.pki.oids['keyBag'];
  const shroudedKeyBagType = forge.pki.oids['pkcs8ShroudedKeyBag'];

  const certificates: Pkcs12Certificate[] = [];
  const certBags = p12.getBags({ bagType: certBagType })[certBagType] ?? [];
  for (const bag of certBags) {
    if (!bag.cert) continue;
    certificates.push({
      fields: extractX509Fields(bag.cert),
      pem: forge.pki.certificateToPem(bag.cert),
      friendlyName: friendlyNameOf(bag),
    });
  }

  const privateKeys: Pkcs12PrivateKey[] = [];
  for (const bagType of [keyBagType, shroudedKeyBagType]) {
    const bags = p12.getBags({ bagType })[bagType] ?? [];
    for (const bag of bags) {
      if (!bag.key) continue;
      privateKeys.push({
        pem: forge.pki.privateKeyToPem(bag.key),
        bits: hasRsaModulus(bag.key) ? bag.key.n.bitLength() : null,
        friendlyName: friendlyNameOf(bag),
      });
    }
  }

  if (certificates.length === 0 && privateKeys.length === 0) {
    return { ok: false, error: 'No certificates or private keys found in this PKCS#12 file.' };
  }

  return { ok: true, contents: { certificates, privateKeys } };
}
