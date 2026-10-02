import { connect as tlsConnect, rootCertificates, getCACertificates, type ConnectionOptions, type TLSSocket, type PeerCertificate, type DetailedPeerCertificate } from 'node:tls';
import { lookup } from 'node:dns/promises';
import { X509Certificate } from 'node:crypto';
import { connect as tcpConnect, isIP, type Socket } from 'node:net';
import { Duplex } from 'node:stream';
import type { ClientIdentity, HostnameVerdict, LiveCertificateSummary, TlsVersionName, TrustVerdict } from "@dude/contracts/core/platform/network-types";
import { crlDistributionPoints, embeddedSctList, splitSctList } from './der';

/**
 * Live TLS inspection (DUDE_PRD.md §21 Phase 28). Every inspection handshake connects with
 * `rejectUnauthorized: false` so a broken certificate can still be seen, and then validates the
 * presented chain separately against two labeled trust stores. Nothing here ever sends
 * application data beyond an optional STARTTLS upgrade performed by the caller.
 */

export interface HandshakeOptions {
  readonly host: string;
  readonly port: number;
  /** SNI name. Defaults to `host` when it is a hostname; `false` sends no SNI. */
  readonly servername?: string | false;
  readonly alpn?: readonly string[];
  readonly minVersion?: TlsVersionName;
  readonly maxVersion?: TlsVersionName;
  readonly ciphers?: string;
  readonly clientIdentity?: ClientIdentity;
  readonly timeoutMs?: number;
  /** An already-connected (e.g. STARTTLS-upgraded) socket to wrap instead of dialing. */
  readonly socket?: Socket;
  readonly requestOcsp?: boolean;
  /** Receives every raw TLS record byte the server sends before `secureConnect` (handshake timeline). */
  readonly onServerBytes?: (chunk: Buffer, atMs: number) => void;
  readonly onClientBytes?: (chunk: Buffer, atMs: number) => void;
}

function tap(socket: Socket, onRead: (chunk: Buffer) => void, onWrite: (chunk: Buffer) => void): Duplex {
  const duplex = new Duplex({
    read() { socket.resume(); },
    write(chunk: Buffer, _encoding, callback) { onWrite(chunk); socket.write(chunk, callback); },
    final(callback) { socket.end(); callback(); },
    destroy(error, callback) { socket.destroy(); callback(error); },
  });
  socket.on('data', (chunk: Buffer) => { onRead(chunk); if (!duplex.push(chunk)) socket.pause(); });
  socket.on('end', () => duplex.push(null));
  socket.on('error', (error) => duplex.destroy(error));
  return duplex;
}

export interface HandshakeTimings {
  readonly dnsMs: number | null;
  readonly tcpMs: number | null;
  readonly tlsMs: number | null;
  readonly totalMs: number;
}

export interface HandshakeResult {
  readonly host: string;
  readonly port: number;
  readonly address: string | null;
  readonly servername: string | null;
  readonly protocol: string | null;
  readonly cipher: { readonly name: string; readonly standardName: string; readonly version: string } | null;
  readonly alpn: string | null;
  readonly ephemeralKey: { readonly type?: string; readonly name?: string; readonly size?: number } | null;
  readonly authorizedByNode: boolean;
  readonly authorizationError: string | null;
  readonly chain: readonly LiveCertificateSummary[];
  readonly ocspStapleBase64: string | null;
  readonly clientCertificateRequested: boolean;
  readonly acceptableClientCAs: readonly string[];
  readonly sessionReused: boolean;
  readonly peerFinishedHex: string | null;
  readonly timings: HandshakeTimings;
}

function certificateChain(peer: DetailedPeerCertificate): Buffer[] {
  const chain: Buffer[] = [];
  const seen = new Set<string>();
  let current: DetailedPeerCertificate | undefined = peer;
  while (current && current.raw && !seen.has(current.fingerprint256) && chain.length < 16) {
    seen.add(current.fingerprint256);
    chain.push(current.raw);
    current = current.issuerCertificate && current.issuerCertificate !== current ? current.issuerCertificate : undefined;
  }
  return chain;
}

function splitDn(dn: string): string {
  return dn.split('\n').filter(Boolean).join(', ');
}

function infoAccessUrls(info: string | undefined, prefix: string): string[] {
  if (!info) return [];
  return info.split('\n').flatMap((line) => line.startsWith(`${prefix} - URI:`) ? [line.slice(prefix.length + 7).trim()] : []);
}

export function summarizeCertificate(der: Buffer, now = Date.now()): LiveCertificateSummary {
  const certificate = new X509Certificate(der);
  const details = certificate.publicKey.asymmetricKeyDetails ?? {};
  const keyType = certificate.publicKey.asymmetricKeyType ?? 'unknown';
  const keyDetail = details.modulusLength ? `${details.modulusLength}-bit` : details.namedCurve ? details.namedCurve : keyType;
  let crlUrls: string[] = [];
  let sctCount = 0;
  try { crlUrls = crlDistributionPoints(der); } catch { crlUrls = []; }
  try { const list = embeddedSctList(der); sctCount = list ? splitSctList(list).length : 0; } catch { sctCount = 0; }
  const validTo = certificate.validToDate;
  return {
    subject: splitDn(certificate.subject),
    issuer: splitDn(certificate.issuer),
    serialNumber: certificate.serialNumber,
    validFrom: certificate.validFromDate.toISOString(),
    validTo: validTo.toISOString(),
    daysRemaining: Math.floor((validTo.getTime() - now) / 86_400_000),
    fingerprint256: certificate.fingerprint256,
    fingerprint1: certificate.fingerprint,
    subjectAltName: (certificate.subjectAltName ?? '').split(/,\s*/).filter(Boolean),
    keyType,
    keyDetail,
    signatureAlgorithm: certificate.signatureAlgorithm ?? 'unknown',
    isCA: certificate.ca,
    selfIssued: certificate.subject === certificate.issuer,
    ocspUrls: infoAccessUrls(certificate.infoAccess, 'OCSP'),
    caIssuerUrls: infoAccessUrls(certificate.infoAccess, 'CA Issuers'),
    crlUrls,
    sctCount,
    derBase64: der.toString('base64'),
  };
}

function identityOptions(identity: ClientIdentity | undefined): Partial<ConnectionOptions> {
  if (!identity) return {};
  if (identity.pfxBase64) return { pfx: Buffer.from(identity.pfxBase64, 'base64'), ...(identity.passphrase ? { passphrase: identity.passphrase } : {}) };
  if (identity.pemCert && identity.pemKey) return { cert: identity.pemCert, key: identity.pemKey, ...(identity.passphrase ? { passphrase: identity.passphrase } : {}) };
  return {};
}

/** One TLS handshake. Resolves after `secureConnect` (or rejects); always destroys the socket. */
export async function tlsHandshake(options: HandshakeOptions, signal: AbortSignal): Promise<HandshakeResult> {
  const started = performance.now();
  const at = () => Math.round(performance.now() - started);
  let address: string | null = isIP(options.host) ? options.host : null;
  let dnsMs: number | null = null;
  if (!options.socket && !address) {
    const resolved = await lookup(options.host);
    address = resolved.address;
    dnsMs = at();
  }
  const servername = options.servername === false ? null : options.servername ?? (isIP(options.host) ? null : options.host);
  let clientCertificateRequested = false;
  let acceptableClientCAs: string[] = [];
  let ocspStaple: Buffer | null = null;
  let tcpMs: number | null = null;
  const raw = options.socket ?? await new Promise<Socket>((resolve, reject) => {
    const tcp = tcpConnect({ host: address ?? options.host, port: options.port });
    const fail = (error: Error) => { tcp.destroy(); reject(error); };
    const timer = setTimeout(() => fail(new Error('TCP connect timed out.')), options.timeoutMs ?? 10_000);
    const onAbort = () => { clearTimeout(timer); fail(new Error('Cancelled.')); };
    signal.addEventListener('abort', onAbort, { once: true });
    tcp.once('connect', () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); tcpMs = at(); resolve(tcp); });
    tcp.once('error', (error) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(error); });
  });
  // TLS reads a net.Socket's handle directly, so observing handshake bytes needs a pass-through tap.
  const transport: Duplex = options.onServerBytes || options.onClientBytes ? tap(raw, (chunk) => options.onServerBytes?.(chunk, at()), (chunk) => options.onClientBytes?.(chunk, at())) : raw;
  return new Promise<HandshakeResult>((resolve, reject) => {
    const connectOptions: ConnectionOptions = {
      socket: transport,
      ...(servername ? { servername } : {}),
      rejectUnauthorized: false,
      ...(options.alpn?.length ? { ALPNProtocols: [...options.alpn] } : {}),
      ...(options.minVersion ? { minVersion: options.minVersion } : {}),
      ...(options.maxVersion ? { maxVersion: options.maxVersion } : {}),
      ...(options.ciphers ? { ciphers: options.ciphers } : {}),
      requestOCSP: options.requestOcsp !== false,
      ...identityOptions(options.clientIdentity),
    };
    const socket: TLSSocket = tlsConnect(connectOptions);
    let settled = false;
    const finish = (error: Error | null, result?: HandshakeResult) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener('abort', onAbort);
      socket.destroy();
      raw.destroy();
      if (error) reject(error); else resolve(result!);
    };
    const onAbort = () => finish(new Error('Cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => finish(new Error('TLS handshake timed out.')), options.timeoutMs ?? 10_000);
    socket.on('OCSPResponse', (response: Buffer) => { ocspStaple = response; });
    // Node doesn't expose a server's CertificateRequest. The TLS 1.2 record parser
    // (network-tls-records.ts) reads it from the plaintext handshake; for TLS 1.3 only a
    // certificate_required alert (116) reveals it, handled in the error path below.
    socket.once('secureConnect', () => {
      const peer = socket.getPeerCertificate(true) as DetailedPeerCertificate;
      const chainDer = peer && peer.raw ? certificateChain(peer) : [];
      const cipher = socket.getCipher();
      const ephemeral = socket.getEphemeralKeyInfo() as { type?: string; name?: string; size?: number } | null;
      const finished = socket.getPeerFinished();
      finish(null, {
        host: options.host, port: options.port, address: address ?? socket.remoteAddress ?? null, servername,
        protocol: socket.getProtocol(), cipher: cipher ? { name: cipher.name, standardName: cipher.standardName, version: cipher.version } : null,
        alpn: socket.alpnProtocol || null,
        ephemeralKey: ephemeral && Object.keys(ephemeral).length ? ephemeral : null,
        authorizedByNode: socket.authorized, authorizationError: socket.authorizationError ? String(socket.authorizationError) : null,
        chain: chainDer.map((der) => summarizeCertificate(der)),
        ocspStapleBase64: ocspStaple ? (ocspStaple as Buffer).toString('base64') : null,
        clientCertificateRequested, acceptableClientCAs,
        sessionReused: socket.isSessionReused(),
        peerFinishedHex: finished ? finished.toString('hex') : null,
        timings: { dnsMs, tcpMs, tlsMs: at(), totalMs: at() },
      });
    });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      const message = error.message ?? String(error);
      if (/CERTIFICATE_REQUIRED|certificate required|HANDSHAKE_FAILURE.*certificate|alert number 116/i.test(message)) {
        clientCertificateRequested = true;
        acceptableClientCAs = [];
      }
      finish(Object.assign(new Error(message), { code: error.code, clientCertificateRequested }));
    });
  });
}

// ---- Trust stores ----
let mozillaStore: X509Certificate[] | null = null;
let windowsStore: X509Certificate[] | null = null;
function parseStore(pems: readonly string[]): X509Certificate[] {
  return pems.flatMap((pem) => { try { return [new X509Certificate(pem)]; } catch { return []; } });
}
export function trustStore(kind: 'mozilla' | 'windows'): X509Certificate[] {
  if (kind === 'mozilla') return mozillaStore ??= parseStore(rootCertificates);
  if (!windowsStore) {
    try { windowsStore = parseStore(getCACertificates('system')); }
    catch { windowsStore = []; }
  }
  return windowsStore;
}
/** Test seam: inject stores. */
export function setTrustStoresForTesting(stores: { mozilla?: readonly string[]; windows?: readonly string[] } | null): void {
  mozillaStore = stores?.mozilla ? parseStore(stores.mozilla) : null;
  windowsStore = stores?.windows ? parseStore(stores.windows) : null;
}

/**
 * Build a path from the leaf using presented certificates first, then the store, verifying each
 * signature and validity window. A presented self-signed root is only trusted if the same
 * certificate (by SHA-256 fingerprint) is in the store.
 */
export function validateChain(chainDer: readonly Buffer[], store: 'mozilla' | 'windows', now = new Date()): TrustVerdict {
  if (!chainDer.length) return { store, trusted: false, reason: 'No certificate was presented.', path: [] };
  const presented = chainDer.map((der) => new X509Certificate(der));
  const anchors = trustStore(store);
  const anchorPrints = new Set(anchors.map((anchor) => anchor.fingerprint256));
  const path: string[] = [];
  let current = presented[0];
  for (let depth = 0; depth < 12; depth++) {
    path.push(current.subject.split('\n').find((part) => part.startsWith('CN='))?.slice(3) ?? current.subject.replace(/\n/g, ', '));
    if (now < current.validFromDate) return { store, trusted: false, reason: `Not yet valid: ${path.at(-1)}.`, path };
    if (now > current.validToDate) return { store, trusted: false, reason: `Expired: ${path.at(-1)} (${current.validToDate.toISOString().slice(0, 10)}).`, path };
    if (anchorPrints.has(current.fingerprint256)) return { store, trusted: true, reason: 'Chains to a trusted root.', path, anchor: path.at(-1) };
    const anchor = anchors.find((candidate) => current.checkIssued(candidate) && current.verify(candidate.publicKey));
    if (anchor) {
      path.push(anchor.subject.split('\n').find((part) => part.startsWith('CN='))?.slice(3) ?? anchor.subject);
      if (now > anchor.validToDate) return { store, trusted: false, reason: 'The trusted root has expired.', path };
      return { store, trusted: true, reason: 'Chains to a trusted root.', path, anchor: path.at(-1) };
    }
    const next = presented.find((candidate) => candidate !== current && current.checkIssued(candidate) && current.verify(candidate.publicKey));
    if (!next) {
      if (current.checkIssued(current)) return { store, trusted: false, reason: 'Self-signed certificate that is not in this trust store.', path };
      return { store, trusted: false, reason: 'Incomplete chain: the issuer was not presented and is not a trusted root (AIA fetch may find it).', path };
    }
    if (!next.ca) return { store, trusted: false, reason: `Issuer is not marked as a CA: ${next.subject.replace(/\n/g, ', ')}.`, path };
    current = next;
  }
  return { store, trusted: false, reason: 'Chain is longer than 12 certificates.', path };
}

// ---- Hostname matching (item 23: Certificate/Hostname Mismatch Analyzer) ----
function sanEntries(summary: Pick<LiveCertificateSummary, 'subjectAltName' | 'subject'>): { dns: string[]; ip: string[]; cn: string | null } {
  const dns: string[] = [], ip: string[] = [];
  for (const entry of summary.subjectAltName) {
    if (entry.startsWith('DNS:')) dns.push(entry.slice(4).toLowerCase());
    else if (entry.startsWith('IP Address:')) ip.push(entry.slice(11).toLowerCase());
  }
  const cn = /(?:^|, )CN=([^,]+)/.exec(summary.subject)?.[1] ?? null;
  return { dns, ip, cn };
}

function wildcardMatch(pattern: string, host: string): boolean {
  if (!pattern.startsWith('*.')) return pattern === host;
  const suffix = pattern.slice(1);
  if (!host.endsWith(suffix)) return false;
  const label = host.slice(0, host.length - suffix.length);
  return label.length > 0 && !label.includes('.');
}

export function analyzeHostname(host: string, leaf: Pick<LiveCertificateSummary, 'subjectAltName' | 'subject'>): HostnameVerdict {
  const target = host.toLowerCase().replace(/\.$/, '');
  const { dns, ip, cn } = sanEntries(leaf);
  const reasons: string[] = [];
  if (isIP(target)) {
    if (ip.includes(target)) return { host, matches: true, matchedName: `IP:${target}`, reasons: ['The IP address is listed as an IP SAN.'] };
    reasons.push(ip.length ? `IP ${target} is not among the IP SANs (${ip.join(', ')}).` : 'The certificate has no IP-address SANs, so it cannot match an IP literal.');
    if (dns.length) reasons.push('Connecting by IP never matches DNS names; connect by hostname instead.');
    return { host, matches: false, reasons };
  }
  const exact = dns.find((name) => name === target);
  if (exact) return { host, matches: true, matchedName: exact, reasons: ['Exact DNS SAN match.'] };
  const wildcard = dns.find((name) => wildcardMatch(name, target));
  if (wildcard) return { host, matches: true, matchedName: wildcard, reasons: ['Matched a wildcard SAN (one label).'] };
  if (!dns.length) {
    reasons.push(cn ? `No DNS SANs. The Common Name "${cn}" is ignored by modern clients (RFC 6125/CA-B Forum).` : 'The certificate has no DNS SANs.');
  } else {
    for (const name of dns) {
      if (name.startsWith('*.') && target.endsWith(name.slice(1)) && target.slice(0, -name.length + 1).includes('.')) reasons.push(`${name} covers only one label; ${target} is deeper.`);
      else if (name.startsWith('*.') && target === name.slice(2)) reasons.push(`${name} does not cover the bare domain ${target}.`);
      else if (name === `www.${target}` || target === `www.${name}`) reasons.push(`Near miss: ${name} differs only by "www."`);
    }
    if (!reasons.length) reasons.push(`None of the ${dns.length} DNS SANs match: ${dns.slice(0, 8).join(', ')}${dns.length > 8 ? ', …' : ''}.`);
  }
  if (cn && cn.toLowerCase() === target) reasons.push('The Common Name matches, but only SANs count.');
  return { host, matches: false, reasons };
}

/** Days-until-expiry buckets used by the chain view and the watch list. */
export function expiryStatus(daysRemaining: number, thresholds: readonly number[] = [30, 14, 7, 1]): 'expired' | 'warning' | 'ok' {
  if (daysRemaining < 0) return 'expired';
  return daysRemaining <= Math.max(...thresholds) ? 'warning' : 'ok';
}

export function chainDerFromSummaries(chain: readonly Pick<LiveCertificateSummary, 'derBase64'>[]): Buffer[] {
  return chain.map((entry) => Buffer.from(entry.derBase64, 'base64'));
}

export type { PeerCertificate };
