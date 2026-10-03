import { X509Certificate, createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { octetString, oid, sequence } from './der-writer.js';
import { OID, buildCertificate, extension, generalName, pemEncode, skiFromSpki, subjectAltNames } from './x509.js';

export { subjectAltNames } from './x509.js';

export interface SelfSignedOptions {
  hubInstanceId: string;
  /** Extra DNS names or IP literals added to the SAN list. */
  extraNames?: readonly string[];
  now?: Date;
  validityYears?: number;
}

export interface TlsIdentity {
  keyPem: string;
  certPem: string;
  spkiSha256: string;
}

export function spkiSha256(source: string | Buffer | KeyObject | X509Certificate): string {
  let key: KeyObject;
  if (source instanceof X509Certificate) key = source.publicKey;
  else if (typeof source === 'string' || Buffer.isBuffer(source)) {
    const text = source.toString();
    key = text.includes('PRIVATE KEY') ? createPublicKey(createPrivateKey(text)) : text.includes('BEGIN CERTIFICATE') ? new X509Certificate(text).publicKey : createPublicKey(text);
  } else key = source.type === 'private' ? createPublicKey(source) : source;
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('base64url');
}

/** Generate a self-signed ECDSA P-256 server certificate (PEM key and cert). */
export function generateSelfSigned(options: SelfSignedOptions): { keyPem: string; certPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const now = options.now ?? new Date();
  const notBefore = new Date(now.getTime() - 3600_000);
  const notAfter = new Date(now);
  notAfter.setUTCFullYear(notAfter.getUTCFullYear() + (options.validityYears ?? 10));
  const ski = skiFromSpki(spki);
  // The subject is unique per key: during a rotation clients trust the active and the next certificate at once, and
  // OpenSSL (on Linux) fails a self-signed leaf with DEPTH_ZERO_SELF_SIGNED_CERT when two trust anchors share its name.
  const cn = `DUDE Hub ${options.hubInstanceId.slice(0, 8)} ${ski.subarray(0, 4).toString('hex')}`;
  const der = buildCertificate({
    subjectCn: cn,
    issuerCn: cn,
    spki,
    notBefore,
    notAfter,
    signerKey: privateKey,
    extensions: [
      extension(OID.basicConstraints, true, sequence()),
      // No keyUsage: with keyUsage present BoringSSL (Electron-as-Node) requires keyCertSign for a self-issued trust anchor,
      // and keyCertSign on a cA:false leaf is invalid. Absent keyUsage places no restriction; EKU serverAuth still scopes it.
      extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
      extension(OID.subjectAltName, false, sequence(...subjectAltNames(options.extraNames).map(generalName))),
      extension(OID.subjectKeyIdentifier, false, octetString(ski)),
    ],
  });
  return { keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), certPem: pemEncode('CERTIFICATE', der) };
}
