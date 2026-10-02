/**
 * Pure, framework-free translation of a `node-forge` ASN.1 node tree into a
 * human-readable presentation tree, plus a shared OID -> name dictionary.
 * Extracted up front (per `AGENTS.md`'s Phase 12 plan) since the PEM/DER
 * Inspector, CSR tools, SSH tools, X.509 Certificate Inspector, Certificate
 * Chain tools, and PKCS#12 Inspector all need to render ASN.1 structure or
 * name an OID.
 */

import forge from 'node-forge';

export interface Asn1TreeNode {
  readonly tagClassName: string;
  readonly typeName: string;
  readonly constructed: boolean;
  readonly byteLength: number;
  /** Human-readable rendering of a primitive leaf's value; absent for constructed nodes. */
  readonly valuePreview?: string;
  readonly children: readonly Asn1TreeNode[];
}

const TAG_CLASS_NAMES: Record<number, string> = {
  [forge.asn1.Class.UNIVERSAL]: 'UNIVERSAL',
  [forge.asn1.Class.APPLICATION]: 'APPLICATION',
  [forge.asn1.Class.CONTEXT_SPECIFIC]: 'CONTEXT_SPECIFIC',
  [forge.asn1.Class.PRIVATE]: 'PRIVATE',
};

const UNIVERSAL_TYPE_NAMES: Record<number, string> = {
  [forge.asn1.Type.NONE]: 'ANY',
  [forge.asn1.Type.BOOLEAN]: 'BOOLEAN',
  [forge.asn1.Type.INTEGER]: 'INTEGER',
  [forge.asn1.Type.BITSTRING]: 'BIT STRING',
  [forge.asn1.Type.OCTETSTRING]: 'OCTET STRING',
  [forge.asn1.Type.NULL]: 'NULL',
  [forge.asn1.Type.OID]: 'OBJECT IDENTIFIER',
  [forge.asn1.Type.ODESC]: 'ObjectDescriptor',
  [forge.asn1.Type.EXTERNAL]: 'EXTERNAL',
  [forge.asn1.Type.REAL]: 'REAL',
  [forge.asn1.Type.ENUMERATED]: 'ENUMERATED',
  [forge.asn1.Type.EMBEDDED]: 'EMBEDDED PDV',
  [forge.asn1.Type.UTF8]: 'UTF8String',
  [forge.asn1.Type.ROID]: 'RELATIVE-OID',
  [forge.asn1.Type.SEQUENCE]: 'SEQUENCE',
  [forge.asn1.Type.SET]: 'SET',
  [forge.asn1.Type.PRINTABLESTRING]: 'PrintableString',
  [forge.asn1.Type.IA5STRING]: 'IA5String',
  [forge.asn1.Type.UTCTIME]: 'UTCTime',
  [forge.asn1.Type.GENERALIZEDTIME]: 'GeneralizedTime',
  [forge.asn1.Type.BMPSTRING]: 'BMPString',
};

/** Common X.509/PKCS OID -> friendly-name dictionary. Not exhaustive — falls back to the raw OID. */
export const OID_NAMES: Record<string, string> = {
  // Distinguished Name attribute types
  '2.5.4.3': 'commonName',
  '2.5.4.4': 'surname',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'countryName',
  '2.5.4.7': 'localityName',
  '2.5.4.8': 'stateOrProvinceName',
  '2.5.4.10': 'organizationName',
  '2.5.4.11': 'organizationalUnitName',
  '2.5.4.12': 'title',
  '2.5.4.42': 'givenName',
  '1.2.840.113549.1.9.1': 'emailAddress',

  // Public-key / signature algorithms
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'rsassaPss',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.2.1': 'id-ecPublicKey',
  '1.2.840.10045.4.3.2': 'ecdsaWithSHA256',
  '1.2.840.10045.4.3.3': 'ecdsaWithSHA384',
  '1.2.840.10045.4.3.4': 'ecdsaWithSHA512',
  '1.2.840.10045.3.1.7': 'prime256v1 (P-256)',
  '1.3.132.0.34': 'secp384r1 (P-384)',
  '1.3.132.0.35': 'secp521r1 (P-521)',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',

  // X.509v3 extensions
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.37': 'extKeyUsage',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',

  // PKCS#9 attributes (CSR)
  '1.2.840.113549.1.9.7': 'challengePassword',
  '1.2.840.113549.1.9.14': 'extensionRequest',

  // PKCS#12 bag / content types
  '1.2.840.113549.1.12.10.1.1': 'keyBag',
  '1.2.840.113549.1.12.10.1.2': 'pkcs8ShroudedKeyBag',
  '1.2.840.113549.1.12.10.1.3': 'certBag',
  '1.2.840.113549.1.9.22.1': 'x509Certificate',

  // PBE / PBES2 (PKCS#5 / PKCS#12 password-based encryption)
  '1.2.840.113549.1.5.12': 'PBKDF2',
  '1.2.840.113549.1.5.13': 'PBES2',
  '1.2.840.113549.1.12.1.3': 'pbeWithSHAAnd3-KeyTripleDES-CBC',
  '1.2.840.113549.1.12.1.6': 'pbeWithSHAAnd40BitRC2-CBC',
};

export function oidName(oid: string): string {
  return OID_NAMES[oid] ?? oid;
}

/** `oid (friendlyName)` when known, otherwise just the raw `oid`. */
export function oidLabel(oid: string): string {
  const name = OID_NAMES[oid];
  return name ? `${oid} (${name})` : oid;
}

function derLength(node: forge.asn1.Asn1): number {
  try {
    return forge.asn1.toDer(node).length();
  } catch {
    return 0;
  }
}

function hexPreview(raw: string): string {
  const hex = forge.util.bytesToHex(raw);
  return hex.length > 64 ? `${hex.slice(0, 64)}… (${raw.length} bytes)` : hex || '(empty)';
}

function previewValue(node: forge.asn1.Asn1): string {
  const raw = node.value as string;

  if (node.tagClass !== forge.asn1.Class.UNIVERSAL) return hexPreview(raw);

  switch (node.type) {
    case forge.asn1.Type.OID:
      try {
        return oidLabel(forge.asn1.derToOid(raw));
      } catch {
        return hexPreview(raw);
      }
    case forge.asn1.Type.INTEGER:
      try {
        return String(forge.asn1.derToInteger(raw));
      } catch {
        return `0x${hexPreview(raw)}`;
      }
    case forge.asn1.Type.BOOLEAN:
      return raw.charCodeAt(0) !== 0 ? 'TRUE' : 'FALSE';
    case forge.asn1.Type.NULL:
      return '(null)';
    case forge.asn1.Type.UTCTIME:
      try {
        return forge.asn1.utcTimeToDate(raw).toISOString();
      } catch {
        return raw;
      }
    case forge.asn1.Type.GENERALIZEDTIME:
      try {
        return forge.asn1.generalizedTimeToDate(raw).toISOString();
      } catch {
        return raw;
      }
    case forge.asn1.Type.UTF8:
    case forge.asn1.Type.PRINTABLESTRING:
    case forge.asn1.Type.IA5STRING:
      return raw;
    case forge.asn1.Type.BMPSTRING:
      // BMPString is UTF-16BE; forge stores it as a raw binary string.
      try {
        return forge.util.text.utf16.decode(forge.util.binary.raw.decode(raw));
      } catch {
        return hexPreview(raw);
      }
    case forge.asn1.Type.BITSTRING:
    case forge.asn1.Type.OCTETSTRING:
    default:
      return hexPreview(raw);
  }
}

export function buildAsn1Tree(node: forge.asn1.Asn1): Asn1TreeNode {
  const tagClassName = TAG_CLASS_NAMES[node.tagClass] ?? `0x${node.tagClass.toString(16)}`;
  const typeName =
    node.tagClass === forge.asn1.Class.UNIVERSAL
      ? (UNIVERSAL_TYPE_NAMES[node.type] ?? `[UNIVERSAL ${node.type}]`)
      : `[${tagClassName} ${node.type}]`;
  const byteLength = derLength(node);

  if (Array.isArray(node.value)) {
    return {
      tagClassName,
      typeName,
      constructed: true,
      byteLength,
      children: node.value.map(buildAsn1Tree),
    };
  }

  return {
    tagClassName,
    typeName,
    constructed: node.constructed,
    byteLength,
    valuePreview: previewValue(node),
    children: [],
  };
}
