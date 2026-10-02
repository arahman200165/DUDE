import { createHash, X509Certificate, verify } from 'node:crypto';
import type { NetworkRequest, RevocationAction } from "@dude/contracts/core/platform/network-types";
import { certificateParts, children, integerFromHex, integerHex, oid, octets, parse, raw, seq, time, tlv, value, encodeOid, OID, type DerNode } from './der';

/**
 * Revocation Inspector (DUDE_PRD.md §21 Phase 28 items 18, 19) and AIA issuer fetch. It contacts
 * only the OCSP/CRL/AIA URLs named in the certificate itself (never a user-typed host), over HTTP,
 * with size caps and same-host redirects only. OCSP and CRL signatures are verified locally.
 */
const MAX_OCSP_BYTES = 256 * 1024;
const MAX_CRL_BYTES = 20 * 1024 * 1024;
const MAX_AIA_BYTES = 512 * 1024;

// Signature algorithm OID → node hash name. Ed25519/Ed448 use null (verify infers from the key).
const SIG_ALG: Record<string, string | null> = {
  '1.2.840.113549.1.1.5': 'sha1', '1.2.840.113549.1.1.11': 'sha256', '1.2.840.113549.1.1.12': 'sha384', '1.2.840.113549.1.1.13': 'sha512',
  '1.2.840.10045.4.1': 'sha1', '1.2.840.10045.4.3.2': 'sha256', '1.2.840.10045.4.3.3': 'sha384', '1.2.840.10045.4.3.4': 'sha512',
  '1.3.101.112': null, '1.3.101.113': null,
};
const isEcdsa = (algOid: string) => algOid.startsWith('1.2.840.10045.4');

function verifySignature(algOid: string, tbs: Buffer, signature: Buffer, cert: X509Certificate): boolean {
  const hash = SIG_ALG[algOid];
  if (hash === undefined) return false;
  try {
    return isEcdsa(algOid)
      ? verify(hash, tbs, cert.publicKey, signature) // DER ECDSA signature: default encoding
      : verify(hash, tbs, cert.publicKey, signature);
  } catch { return false; }
}

// ---- OCSP ----
/** CertID uses SHA-1 over the issuer name and issuer public key (RFC 6960 §4.1.1). */
export function buildOcspRequest(leafDer: Buffer, issuerDer: Buffer): Buffer {
  const leaf = certificateParts(leafDer);
  const issuer = certificateParts(issuerDer);
  const issuerNameHash = createHash('sha1').update(issuer.subjectRaw).digest();
  // issuerKeyHash is over the BIT STRING contents of the issuer SPKI (without the unused-bits byte).
  const spki = parse(issuer.spkiRaw);
  const keyBitString = children(spki)[1];
  const keyBytes = value(keyBitString).subarray(1);
  const issuerKeyHash = createHash('sha1').update(keyBytes).digest();
  const algId = seq(encodeOid(OID.sha1), Buffer.from([0x05, 0x00]));
  const certId = seq(algId, octets(issuerNameHash), octets(issuerKeyHash), integerFromHex(leaf.serialHex));
  const requestList = seq(seq(certId));
  const tbsRequest = seq(requestList);
  return seq(tbsRequest);
}

export type OcspStatus = 'good' | 'revoked' | 'unknown';
export interface OcspResult {
  readonly source: 'stapled' | 'responder';
  readonly url?: string;
  readonly responseStatus: string;
  readonly certStatus?: OcspStatus;
  readonly thisUpdate?: string;
  readonly nextUpdate?: string;
  readonly revocationTime?: string;
  readonly revocationReason?: string;
  readonly producedAt?: string;
  readonly responder?: string;
  readonly signatureValid?: boolean;
  readonly signatureNote?: string;
}
const OCSP_STATUS = ['successful', 'malformedRequest', 'internalError', 'tryLater', '(unused)', 'sigRequired', 'unauthorized'];
const REVOCATION_REASONS = ['unspecified', 'keyCompromise', 'cACompromise', 'affiliationChanged', 'superseded', 'cessationOfOperation', 'certificateHold', '(unused)', 'removeFromCRL', 'privilegeWithdrawn', 'aACompromise'];

/** Parse an OCSPResponse (RFC 6960), verifying the BasicOCSPResponse signature against the issuer or a delegated responder. */
export function parseOcspResponse(der: Buffer, issuerDer: Buffer, source: OcspResult['source'] = 'responder', url?: string): OcspResult {
  const response = parse(der);
  const top = children(response);
  const status = value(top[0])[0];
  if (status !== 0 || top.length < 2) return { source, url, responseStatus: OCSP_STATUS[status] ?? `status ${status}` };
  const responseBytes = children(top[1])[0];
  const rb = children(responseBytes);
  if (oid(rb[0]) !== OID.ocspBasic) return { source, url, responseStatus: 'successful', signatureNote: 'Non-basic OCSP response type.' };
  const basic = parse(value(rb[1]));
  const [tbsResponseData, sigAlg, sigBitString, ...rest] = children(basic);
  const tbs = children(tbsResponseData);
  // tbsResponseData: [version] responderID producedAt responses [responseExtensions]
  let index = 0;
  if (tbs[index].tag === 0xa0) index++;
  const responderId = tbs[index++];
  const producedAt = time(tbs[index++]);
  const responses = children(tbs[index++]);
  const single = children(responses[0]);
  const certId = single[0];
  void certId;
  const certStatusNode = single[1];
  const certStatus: OcspStatus = certStatusNode.tag === 0x80 ? 'good' : certStatusNode.tag === 0xa1 ? 'revoked' : 'unknown';
  const thisUpdate = time(single[2]);
  let nextUpdate: string | undefined;
  let revocationTime: string | undefined;
  let revocationReason: string | undefined;
  if (certStatus === 'revoked') {
    const revoked = children(certStatusNode);
    revocationTime = time(revoked[0]);
    if (revoked[1]?.tag === 0xa0) revocationReason = REVOCATION_REASONS[value(children(revoked[1])[0])[0]] ?? 'unspecified';
  }
  for (let i = 3; i < single.length; i++) if (single[i].tag === 0xa0) { const nu = children(single[i]); if (nu[0]) nextUpdate = time(nu[0]); }

  // Signature verification.
  const signature = value(sigBitString).subarray(1);
  const algOid = oid(children(sigAlg)[0]);
  const issuer = new X509Certificate(issuerDer);
  let signatureValid = verifySignature(algOid, raw(tbsResponseData), signature, issuer);
  let signatureNote = signatureValid ? 'Signed by the issuer.' : '';
  let responderName = issuer.subject.split('\n').find((part) => part.startsWith('CN=')) ?? issuer.subject.replace(/\n/g, ', ');
  if (!signatureValid && rest.length) {
    // Delegated responder: certs are in an explicit [0] tag holding a SEQUENCE OF Certificate.
    const certsHolder = rest.find((node) => node.tag === 0xa0);
    if (certsHolder) {
      for (const certNode of children(children(certsHolder)[0])) {
        try {
          const responderCert = new X509Certificate(raw(certNode));
          const issuedByIssuer = responderCert.checkIssued(issuer) && responderCert.verify(issuer.publicKey);
          const hasOcspEku = /OCSP Signing/i.test(responderCert.keyUsage?.join(' ') ?? '') || responderCert.toString().includes('1.3.6.1.5.5.7.3.9');
          if (issuedByIssuer && verifySignature(algOid, raw(tbsResponseData), signature, responderCert)) {
            signatureValid = true;
            responderName = responderCert.subject.split('\n').find((part) => part.startsWith('CN=')) ?? responderCert.subject;
            signatureNote = hasOcspEku ? 'Signed by a delegated responder issued by the CA.' : 'Signed by a delegated responder (OCSPSigning EKU not confirmed).';
          }
        } catch { /* try next cert */ }
      }
    }
  }
  if (!signatureValid && !signatureNote) signatureNote = 'Signature did not verify against the issuer or an embedded responder certificate.';
  void responderId;
  return { source, url, responseStatus: 'successful', certStatus, thisUpdate, nextUpdate, revocationTime, revocationReason, producedAt, responder: responderName, signatureValid, signatureNote };
}

// ---- CRL ----
export interface CrlResult {
  readonly url: string;
  readonly issuer: string;
  readonly thisUpdate: string;
  readonly nextUpdate?: string;
  readonly entries: number;
  readonly serial: string;
  readonly revoked: boolean;
  readonly revocationTime?: string;
  readonly revocationReason?: string;
  readonly signatureValid: boolean;
  readonly signatureNote: string;
  readonly truncatedEntryScan: boolean;
}
export function parseCrl(der: Buffer, serialHex: string, issuerDer: Buffer, url: string): CrlResult {
  const crl = parse(der);
  const [tbs, sigAlg, sigBitString] = children(crl);
  const fields = children(tbs);
  let index = 0;
  if (fields[0].tag === 0x02) index++; // version
  index++; // signature algorithm
  const issuerNode = fields[index++];
  const thisUpdate = time(fields[index++]);
  let nextUpdate: string | undefined;
  if (fields[index] && (fields[index].tag === 0x17 || fields[index].tag === 0x18)) nextUpdate = time(fields[index++]);
  let revoked = false;
  let revocationTime: string | undefined;
  let revocationReason: string | undefined;
  let entries = 0;
  const target = serialHex.replace(/^0+/, '').toUpperCase();
  const revokedList = fields[index] && fields[index].tag === 0x30 ? children(fields[index]) : [];
  for (const entry of revokedList) {
    entries++;
    const parts = children(entry);
    if (integerHex(parts[0]).replace(/^0+/, '').toUpperCase() === target) {
      revoked = true;
      revocationTime = time(parts[1]);
      if (parts[2]?.tag === 0x30) for (const ext of children(parts[2])) { const extParts = children(ext); if (oid(extParts[0]) === OID.crlReason) { const reasonDer = parse(value(extParts[extParts.length - 1])); revocationReason = REVOCATION_REASONS[value(reasonDer)[0]] ?? 'unspecified'; } }
    }
  }
  const issuer = new X509Certificate(issuerDer);
  const algOid = oid(children(sigAlg)[0]);
  const signatureValid = verifySignature(algOid, raw(tbs), value(sigBitString).subarray(1), issuer);
  return {
    url, issuer: dnText(issuerNode), thisUpdate, nextUpdate, entries, serial: serialHex, revoked, revocationTime, revocationReason,
    signatureValid, signatureNote: signatureValid ? 'CRL signed by the issuer.' : 'CRL signature did not verify against the issuer.', truncatedEntryScan: false,
  };
}
function dnText(name: DerNode): string {
  const parts: string[] = [];
  for (const rdn of children(name)) for (const attr of children(rdn)) { const av = children(attr); parts.push(value(av[1]).toString('utf8')); }
  return parts.join(', ');
}

// ---- HTTP fetch of CA-named URLs ----
async function fetchDer(url: string, signal: AbortSignal, maxBytes: number, accept: string): Promise<Buffer> {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP(S) revocation URLs are contacted.');
  const response = await fetch(target, { headers: { accept }, redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  if (response.status >= 300 && response.status < 400) throw new Error(`Redirect to ${response.headers.get('location') ?? 'another host'} not followed.`);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${target.host}.`);
  const chunks: Buffer[] = [];
  let total = 0;
  if (!response.body) throw new Error('Empty response.');
  for await (const chunk of response.body) { total += chunk.length; if (total > maxBytes) throw new Error(`Response exceeds ${Math.round(maxBytes / 1024)} KB.`); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
async function postOcsp(url: string, request: Buffer, signal: AbortSignal): Promise<Buffer> {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP(S) OCSP URLs are contacted.');
  const response = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/ocsp-request', accept: 'application/ocsp-response' }, body: Uint8Array.from(request), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${target.host}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_OCSP_BYTES) throw new Error('OCSP response too large.');
  return buffer;
}

/** A DER cert, or the first cert from a PKCS#7 "certs-only" bundle (AIA caIssuers). */
export function extractIssuerDer(bytes: Buffer): Buffer {
  const node = parse(bytes);
  const inner = children(node);
  if (inner[0]?.tag === 0x02 && inner.length >= 3) return raw(node); // looks like a Certificate (version, serial, ...)
  // PKCS#7 SignedData: pull the first certificate out of the [0] certificates field.
  let found: Buffer | null = null;
  const walkPkcs7 = (n: DerNode, depth: number) => {
    if (found || depth > 8) return;
    if (n.tag === 0xa0) { try { const first = children(n)[0]; if (first?.tag === 0x30 && children(first)[0]?.tag === 0xa0) { found = raw(first); return; } } catch { /* keep walking */ } }
    if (n.constructed) for (const child of children(n)) walkPkcs7(child, depth + 1);
  };
  walkPkcs7(node, 0);
  if (found) return found;
  return raw(node);
}

export interface RevocationResult {
  readonly host: string;
  readonly action: RevocationAction | 'all';
  readonly serial: string;
  readonly leafSubject: string;
  readonly issuerSubject: string;
  readonly ocsp?: OcspResult;
  readonly crl?: CrlResult;
  readonly aia?: { readonly url: string; readonly fetchedIssuer?: string; readonly error?: string };
  readonly urls: { readonly ocsp: readonly string[]; readonly crl: readonly string[]; readonly aia: readonly string[] };
  readonly note?: string;
}

export async function inspectRevocation(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<RevocationResult> {
  const chainB64 = request.chainBase64 ?? [];
  if (chainB64.length < 1) throw new Error('Provide the certificate chain (fetch it in the Live Certificate Chain tool first).');
  const leafDer = Buffer.from(chainB64[0], 'base64');
  const leaf = new X509Certificate(leafDer);
  const leafParts = certificateParts(leafDer);
  const infoAccess = leaf.infoAccess ?? '';
  const ocspUrls = infoAccess.split('\n').flatMap((line) => line.startsWith('OCSP - URI:') ? [line.slice(11).trim()] : []);
  const aiaUrls = infoAccess.split('\n').flatMap((line) => line.startsWith('CA Issuers - URI:') ? [line.slice(17).trim()] : []);
  let crlUrls: string[] = [];
  try { crlUrls = (await import('./der')).crlDistributionPoints(leafDer); } catch { crlUrls = []; }
  const urls = { ocsp: ocspUrls, crl: crlUrls, aia: aiaUrls };
  const chosen = request.urls ?? [];
  const action = request.revocationAction ?? 'all';

  let issuerDer = chainB64[1] ? Buffer.from(chainB64[1], 'base64') : null;
  const result: { -readonly [K in keyof RevocationResult]: RevocationResult[K] } = {
    host: request.target ?? leaf.subject, action, serial: leafParts.serialHex, leafSubject: leaf.subject.replace(/\n/g, ', '), issuerSubject: leaf.issuer.replace(/\n/g, ', '), urls,
  };

  // AIA: fetch the missing issuer.
  if ((action === 'aia' || !issuerDer) && aiaUrls.length && (action === 'aia' || action === 'all')) {
    const url = chosen.find((value) => aiaUrls.includes(value)) ?? aiaUrls[0];
    try {
      const bytes = await fetchDer(url, signal, MAX_AIA_BYTES, 'application/pkix-cert, application/pkcs7-mime');
      const fetched = extractIssuerDer(bytes);
      const cert = new X509Certificate(fetched);
      if (leaf.checkIssued(cert)) { issuerDer = Buffer.from(fetched); result.aia = { url, fetchedIssuer: cert.subject.replace(/\n/g, ', ') }; }
      else result.aia = { url, error: 'The fetched certificate is not the issuer of this leaf.' };
    } catch (error) { result.aia = { url, error: error instanceof Error ? error.message : String(error) }; }
    progress(1, 3);
  }

  if ((action === 'ocsp' || action === 'all')) {
    if (request.chainBase64 && !ocspUrls.length) result.note = 'The certificate lists no OCSP responder.';
    else if (issuerDer && ocspUrls.length) {
      const url = chosen.find((value) => ocspUrls.includes(value)) ?? ocspUrls[0];
      try {
        const ocspRequest = buildOcspRequest(leafDer, issuerDer);
        const response = await postOcsp(url, ocspRequest, signal);
        result.ocsp = parseOcspResponse(response, issuerDer, 'responder', url);
      } catch (error) { result.ocsp = { source: 'responder', url, responseStatus: 'error', signatureNote: error instanceof Error ? error.message : String(error) }; }
    } else if (!issuerDer) result.note = 'The issuer certificate is required for OCSP; fetch it via AIA first.';
    progress(2, 3);
  }

  if ((action === 'crl' || action === 'all') && crlUrls.length && issuerDer) {
    const url = chosen.find((value) => crlUrls.includes(value)) ?? crlUrls[0];
    try {
      const bytes = await fetchDer(url, signal, MAX_CRL_BYTES, 'application/pkix-crl');
      const der = bytes[0] === 0x30 ? bytes : Buffer.from(bytes.toString('latin1').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
      result.crl = parseCrl(der, leafParts.serialHex, issuerDer, url);
    } catch (error) { result.crl = { url, issuer: '', thisUpdate: '', entries: 0, serial: leafParts.serialHex, revoked: false, signatureValid: false, signatureNote: error instanceof Error ? error.message : String(error), truncatedEntryScan: false }; }
    progress(3, 3);
  }
  return result;
}

/** Stapled OCSP decode (no network), used by the TLS/live-chain drill-down. */
export function decodeStapledOcsp(base64: string, issuerDer: Buffer): OcspResult {
  return parseOcspResponse(Buffer.from(base64, 'base64'), issuerDer, 'stapled');
}
export { tlv };
