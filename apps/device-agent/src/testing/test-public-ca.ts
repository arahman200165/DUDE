import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { spkiSha256Of } from '../hub/pinned-transport.js';
import type { PublicCaTestSeam } from '../hub/pinned-transport.js';
// Test-only: the Hub's own DER writer builds the throwaway CA and leaves, so the chains here are real X.509 that Node validates.
import { KEY_USAGE, OID, authorityKeyIdentifierValue, basicConstraintsValue, buildCertificate, extension, generalName, keyUsageValue, pemEncode, skiFromSpki } from '../../../hub/src/tls/x509.js';
import { octetString, oid, sequence } from '../../../hub/src/tls/der-writer.js';

/**
 * A throwaway "public" CA for specs (Milestone 838). It is trusted ONLY by handing its certificate to the `publicCaTestSeam` of a test target; nothing here
 * touches a process-wide trust setting, `NODE_EXTRA_CA_CERTS` or `rejectUnauthorized`.
 */
export interface TestPublicCa {
  caCertPem: string;
  /** The seam for a `public-ca` target whose chain should validate against THIS CA, dialling the loopback test server. */
  seam(dialAddress?: string): PublicCaTestSeam;
  issue(options: IssueOptions): { keyPem: string; certPem: string; spki: string };
}

export interface IssueOptions { names: readonly string[]; notBefore?: Date; notAfter?: Date }

function keyIdOf(key: KeyObject): Buffer {
  return skiFromSpki(createPublicKey(key).export({ type: 'spki', format: 'der' }));
}

export function createTestPublicCa(label = 'Test Public Root'): TestPublicCa {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const ski = skiFromSpki(spki);
  const now = Date.now();
  const caDer = buildCertificate({
    subjectCn: label, issuerCn: label, spki, notBefore: new Date(now - 86_400_000), notAfter: new Date(now + 3650 * 86_400_000), signerKey: privateKey,
    extensions: [
      extension(OID.basicConstraints, true, basicConstraintsValue(true, 0)),
      extension(OID.keyUsage, true, keyUsageValue([KEY_USAGE.keyCertSign, KEY_USAGE.cRLSign])),
      extension(OID.subjectKeyIdentifier, false, octetString(ski)),
    ],
  });
  const caCertPem = pemEncode('CERTIFICATE', caDer);
  return {
    caCertPem,
    seam: (dialAddress) => ({ roots: [caCertPem], ...(dialAddress !== undefined ? { dialAddress } : {}) }),
    issue({ names, notBefore, notAfter }) {
      const leaf = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const leafSpki = leaf.publicKey.export({ type: 'spki', format: 'der' });
      const der = buildCertificate({
        subjectCn: names[0] ?? 'leaf', issuerCn: label, spki: leafSpki,
        notBefore: notBefore ?? new Date(now - 3600_000), notAfter: notAfter ?? new Date(now + 90 * 86_400_000), signerKey: privateKey,
        extensions: [
          extension(OID.basicConstraints, true, basicConstraintsValue(false)),
          extension(OID.keyUsage, true, keyUsageValue([KEY_USAGE.digitalSignature])),
          extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
          extension(OID.subjectAltName, false, sequence(...names.map(generalName))),
          extension(OID.subjectKeyIdentifier, false, octetString(skiFromSpki(leafSpki))),
          extension(OID.authorityKeyIdentifier, false, authorityKeyIdentifierValue(keyIdOf(privateKey))),
        ],
      });
      const certPem = pemEncode('CERTIFICATE', der);
      return { keyPem: leaf.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), certPem, spki: spkiSha256Of(certPem) };
    },
  };
}
