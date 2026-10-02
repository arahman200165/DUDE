/**
 * Pure extraction of a `node-forge` X.509 `Certificate` into a flat,
 * presentation-ready field set. Shared by the X.509 Certificate Inspector
 * and the Certificate Chain Viewer/Builder (both need subject/issuer/
 * validity/SAN summaries), per the Phase 12 plan's cross-cutting decision to
 * extract this up front alongside `asn1-tree.ts`.
 *
 * Relies on `node-forge`'s own extension parsing (`keyUsage`, `basicConstraints`,
 * `extKeyUsage`, `subjectAltName` are already decoded into named fields by
 * `node-forge/lib/x509.js` — including `iPAddress` SAN entries, which forge
 * already formats as a dotted-quad/IPv6 string via `forge.util.bytesToIP`)
 * rather than re-walking the raw ASN.1 for these well-known extensions.
 */

import forge from 'node-forge';
import { oidName } from "./asn1-tree.js";

export interface X509NameField {
  readonly shortName: string;
  readonly name: string;
  readonly value: string;
}

const GENERAL_NAME_TYPE_NAMES: Record<number, string> = {
  0: 'otherName',
  1: 'rfc822Name (email)',
  2: 'dNSName',
  3: 'x400Address',
  4: 'directoryName',
  5: 'ediPartyName',
  6: 'uniformResourceIdentifier',
  7: 'iPAddress',
  8: 'registeredID',
};

export interface X509SanEntry {
  readonly typeName: string;
  readonly value: string;
}

export interface X509Fields {
  readonly subject: readonly X509NameField[];
  readonly issuer: readonly X509NameField[];
  readonly serialNumber: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly signatureAlgorithm: string;
  readonly publicKeyBits: number | null;
  readonly subjectAltNames: readonly X509SanEntry[];
  readonly isCA: boolean | null;
  readonly pathLenConstraint: number | null;
  readonly keyUsage: readonly string[];
  readonly extKeyUsage: readonly string[];
  readonly subjectKeyIdentifier: string | null;
}

function nameFields(name: { readonly attributes: forge.pki.CertificateField[] }): readonly X509NameField[] {
  return name.attributes.map((attr) => ({
    shortName: attr.shortName ?? '',
    name: attr.name ?? '',
    value: typeof attr.value === 'string' ? attr.value : String(attr.value ?? ''),
  }));
}

function hasRsaModulus(key: unknown): key is { readonly n: forge.jsbn.BigInteger } {
  return typeof key === 'object' && key !== null && 'n' in key;
}

const KEY_USAGE_FLAGS = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
] as const;

interface ForgeExtension {
  readonly name?: string;
  readonly altNames?: ReadonlyArray<{ readonly type: number; readonly value: unknown; readonly ip?: string; readonly oid?: string }>;
  readonly cA?: boolean;
  readonly pathLenConstraint?: number;
  readonly subjectKeyIdentifier?: string;
  readonly [key: string]: unknown;
}

function sanEntryValue(altName: { readonly type: number; readonly value: unknown; readonly ip?: string; readonly oid?: string }): string {
  if (altName.type === 7) return altName.ip ?? '(unparsed IP)';
  if (altName.type === 8) return altName.oid ? oidName(altName.oid) : '(unparsed OID)';
  if (typeof altName.value === 'string') return altName.value;
  return '(unsupported GeneralName encoding)';
}

export function extractX509Fields(cert: forge.pki.Certificate): X509Fields {
  const extensions = cert.extensions as readonly ForgeExtension[];

  const sanExtension = extensions.find((e) => e.name === 'subjectAltName');
  const subjectAltNames: X509SanEntry[] = (sanExtension?.altNames ?? []).map((altName) => ({
    typeName: GENERAL_NAME_TYPE_NAMES[altName.type] ?? `GeneralName[${altName.type}]`,
    value: sanEntryValue(altName),
  }));

  const basicConstraints = extensions.find((e) => e.name === 'basicConstraints');
  const keyUsageExt = extensions.find((e) => e.name === 'keyUsage');
  const keyUsage = keyUsageExt ? KEY_USAGE_FLAGS.filter((flag) => keyUsageExt[flag] === true) : [];

  const extKeyUsageExt = extensions.find((e) => e.name === 'extKeyUsage');
  const extKeyUsage = extKeyUsageExt
    ? Object.entries(extKeyUsageExt)
        .filter(([key, value]) => value === true && key !== 'name' && key !== 'id' && key !== 'critical' && key !== 'value')
        .map(([key]) => key)
    : [];

  const subjectKeyIdExt = extensions.find((e) => e.name === 'subjectKeyIdentifier');

  return {
    subject: nameFields(cert.subject),
    issuer: nameFields(cert.issuer),
    serialNumber: cert.serialNumber,
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    signatureAlgorithm: oidName(cert.signatureOid),
    publicKeyBits: hasRsaModulus(cert.publicKey) ? cert.publicKey.n.bitLength() : null,
    subjectAltNames,
    isCA: basicConstraints ? (basicConstraints.cA ?? false) : null,
    pathLenConstraint: basicConstraints?.pathLenConstraint ?? null,
    keyUsage,
    extKeyUsage,
    subjectKeyIdentifier: subjectKeyIdExt?.subjectKeyIdentifier ?? null,
  };
}

export type CertificateTimeStatus = 'valid' | 'not-yet-valid' | 'expired';

/** One-shot validity-window check against a given instant — never an ongoing monitor. */
export function certificateTimeStatus(notBefore: Date, notAfter: Date, now: Date = new Date()): CertificateTimeStatus {
  if (now < notBefore) return 'not-yet-valid';
  if (now > notAfter) return 'expired';
  return 'valid';
}
