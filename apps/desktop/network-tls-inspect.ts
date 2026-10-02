import type { NetworkRequest, StartTlsProtocol, TlsVersionName, TrustVerdict } from "@dude/contracts/core/platform/network-types";
import { analyzeHostname, chainDerFromSummaries, tlsHandshake, trustStore, validateChain, type HandshakeResult } from './network-tls';
import { parseServerRecords, type TlsRecordEvent } from './network-tls-records';
import { DEFAULT_STARTTLS_PORT, startTlsUpgrade } from './network-starttls';

/**
 * TLS Connection Inspector orchestration (Phase 28 items 10, 13, 14, 22): one inspection handshake,
 * both trust-store verdicts, hostname matching, optional SNI variants, and a handshake timeline
 * from the raw record bytes.
 */
export interface WeaknessFinding { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info'; readonly title: string; readonly detail?: string; readonly reference?: string }

/** Configuration weaknesses derivable from a single negotiated handshake (no bug-triggering probes). */
export function weaknessReport(handshake: HandshakeResult): WeaknessFinding[] {
  const findings: WeaknessFinding[] = [];
  const protocol = handshake.protocol ?? '';
  if (protocol === 'TLSv1' || protocol === 'TLSv1.1') findings.push({ id: 'legacy-version', status: 'fail', title: `Negotiated ${protocol}, which is deprecated`, reference: 'RFC 8996' });
  else if (protocol === 'TLSv1.3' || protocol === 'TLSv1.2') findings.push({ id: 'version', status: 'pass', title: `Negotiated ${protocol}` });
  const cipher = handshake.cipher?.standardName ?? handshake.cipher?.name ?? '';
  if (/RC4/i.test(cipher)) findings.push({ id: 'rc4', status: 'fail', title: `RC4 cipher (${cipher})`, reference: 'RFC 7465' });
  if (/3DES|DES_CBC3|DES-CBC3/i.test(cipher)) findings.push({ id: '3des', status: 'fail', title: `3DES cipher (${cipher}) — 64-bit block (SWEET32)`, reference: 'RFC 7457 §2.6' });
  if (/(^|_)DES(_|$)|_NULL_|_EXPORT|_anon_|_ADH_|_AECDH/i.test(cipher)) findings.push({ id: 'weak-cipher', status: 'fail', title: `Weak or unauthenticated cipher (${cipher})` });
  if (/_CBC_/i.test(cipher) && (protocol === 'TLSv1' || protocol === 'TLSv1.1')) findings.push({ id: 'cbc-legacy', status: 'warn', title: 'CBC cipher on a legacy protocol (BEAST/Lucky13 class)', reference: 'RFC 7457' });
  const ephemeral = handshake.ephemeralKey;
  if (ephemeral) {
    if (ephemeral.type === 'DH' && ephemeral.size && ephemeral.size < 2048) findings.push({ id: 'weak-dh', status: 'fail', title: `Ephemeral DH group is only ${ephemeral.size} bits (Logjam)`, reference: 'RFC 7919' });
    else if (ephemeral.size) findings.push({ id: 'fs', status: 'pass', title: `Forward secrecy via ${ephemeral.name ?? ephemeral.type} (${ephemeral.size}-bit)` });
  } else if (protocol === 'TLSv1.2') findings.push({ id: 'no-fs', status: 'warn', title: 'No ephemeral key exchange: the cipher does not provide forward secrecy' });
  const leaf = handshake.chain[0];
  if (leaf) {
    if (/(^|with)md5|sha1(withrsa|-with)/i.test(leaf.signatureAlgorithm.replace(/[^a-z0-9]/gi, ''))) findings.push({ id: 'weak-sig', status: 'fail', title: `Leaf certificate signed with ${leaf.signatureAlgorithm}`, reference: 'RFC 9155' });
    if (leaf.keyType === 'rsa' && /(\d+)-bit/.test(leaf.keyDetail)) { const bits = Number(/(\d+)-bit/.exec(leaf.keyDetail)![1]); if (bits < 2048) findings.push({ id: 'weak-key', status: 'fail', title: `Leaf RSA key is only ${bits} bits` }); }
    if (leaf.daysRemaining < 0) findings.push({ id: 'expired', status: 'fail', title: `Leaf certificate expired ${-leaf.daysRemaining} day(s) ago` });
    else if (leaf.daysRemaining <= 30) findings.push({ id: 'expiring', status: 'warn', title: `Leaf certificate expires in ${leaf.daysRemaining} day(s)` });
  }
  if (handshake.ocspStapleBase64) findings.push({ id: 'ocsp-staple', status: 'pass', title: 'Server staples an OCSP response' });
  return findings;
}

async function connect(request: NetworkRequest, servername: string | false, signal: AbortSignal, capture?: { bytes: Buffer; atMs: number }[]): Promise<HandshakeResult> {
  const host = (request.target ?? '').trim();
  const port = request.port ?? (request.starttlsProtocol ? undefined : 443);
  const options = {
    host, port: port ?? 443, servername, alpn: request.alpn, minVersion: request.tlsVersions?.[0], clientIdentity: request.clientIdentity,
    timeoutMs: request.timeoutMs ?? 10_000, requestOcsp: true,
    ...(capture ? { onServerBytes: (bytes: Buffer, atMs: number) => capture.push({ bytes, atMs }) } : {}),
  };
  if (request.starttlsProtocol) {
    const upgraded = await startTlsUpgrade(request.starttlsProtocol, host, request.port ?? 0, signal, request.timeoutMs ?? 10_000);
    return tlsHandshake({ ...options, socket: upgraded.socket, ...(capture ? { onServerBytes: (bytes: Buffer, atMs: number) => capture.push({ bytes, atMs }) } : {}) }, signal);
  }
  return tlsHandshake(options, signal);
}

export interface TlsInspectResult {
  readonly host: string;
  readonly port: number;
  readonly handshake: HandshakeResult;
  readonly trust: readonly TrustVerdict[];
  readonly hostname: ReturnType<typeof analyzeHostname>;
  readonly sniComparison?: readonly { readonly sni: string | false; readonly protocol: string | null; readonly leafSubject: string | null; readonly leafFingerprint: string | null; readonly matchesHost: boolean; readonly error?: string }[];
  readonly timeline?: readonly TlsRecordEvent[];
  readonly certificateRequested: boolean;
  readonly weaknesses: readonly WeaknessFinding[];
}

export async function inspectTls(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<TlsInspectResult> {
  const host = (request.target ?? '').trim();
  const port = request.port ?? 443;
  const wantTimeline = request.captureWire !== false;
  const capture: { bytes: Buffer; atMs: number }[] = wantTimeline ? [] : undefined as never;
  const sni = request.noSni ? false : request.sni?.trim() || host;
  const handshake = await connect(request, sni, signal, wantTimeline ? capture : undefined);
  progress(1, 3);
  const chainDer = chainDerFromSummaries(handshake.chain);
  const trust = handshake.chain.length ? (['mozilla', 'windows'] as const).map((store) => { try { return validateChain(chainDer, store); } catch (error) { return { store, trusted: false, reason: error instanceof Error ? error.message : String(error), path: [] }; } }) : [];
  const hostname = handshake.chain.length ? analyzeHostname(host, handshake.chain[0]) : { host, matches: false, reasons: ['No certificate was presented.'] };
  progress(2, 3);
  let records: ReturnType<typeof parseServerRecords> | undefined;
  if (wantTimeline && capture.length) records = parseServerRecords(capture);

  const variants = request.sniNames ?? [];
  const sniComparison: NonNullable<TlsInspectResult['sniComparison']>[number][] = [];
  if (variants.length) {
    for (const [index, name] of [false as const, ...variants].entries()) {
      if (signal.aborted) break;
      try {
        const variant = await connect({ ...request, captureWire: false }, name, signal);
        const leaf = variant.chain[0];
        sniComparison.push({ sni: name, protocol: variant.protocol, leafSubject: leaf?.subject ?? null, leafFingerprint: leaf?.fingerprint256 ?? null, matchesHost: leaf ? analyzeHostname(typeof name === 'string' ? name : host, leaf).matches : false });
      } catch (error) { sniComparison.push({ sni: name, protocol: null, leafSubject: null, leafFingerprint: null, matchesHost: false, error: error instanceof Error ? error.message : String(error) }); }
      progress(2 + index / (variants.length + 1), 3);
    }
  }
  progress(3, 3);
  return {
    host, port, handshake, trust, hostname, ...(sniComparison.length ? { sniComparison } : {}),
    ...(records ? { timeline: records.events } : {}),
    certificateRequested: handshake.clientCertificateRequested || records?.certificateRequested || false,
    weaknesses: weaknessReport(handshake),
  };
}

export interface LiveChainResult {
  readonly host: string;
  readonly port: number;
  readonly servername: string | null;
  readonly protocol: string | null;
  readonly chain: HandshakeResult['chain'];
  readonly trust: readonly TrustVerdict[];
  readonly hostname: ReturnType<typeof analyzeHostname>;
  readonly incompleteChain: boolean;
  readonly missingIssuerUrls: readonly string[];
  readonly ocspStapleBase64: string | null;
}

/** Live Certificate Chain Fetcher (item 16) + Hostname Mismatch Analyzer (item 23). */
export async function fetchLiveChain(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<LiveChainResult> {
  const host = (request.target ?? '').trim();
  const port = request.port ?? 443;
  const sni = request.noSni ? false : request.sni?.trim() || host;
  const handshake = await connect({ ...request, captureWire: false }, sni, signal);
  progress(1, 2);
  const chainDer = chainDerFromSummaries(handshake.chain);
  const trust = handshake.chain.length ? (['mozilla', 'windows'] as const).map((store) => { try { return validateChain(chainDer, store); } catch (error) { return { store, trusted: false, reason: error instanceof Error ? error.message : String(error), path: [] }; } }) : [];
  const hostname = handshake.chain.length ? analyzeHostname(host, handshake.chain[0]) : { host, matches: false, reasons: ['No certificate was presented.'] };
  const incompleteChain = trust.some((verdict) => /Incomplete chain/.test(verdict.reason));
  const missingIssuerUrls = incompleteChain ? handshake.chain.at(-1)?.caIssuerUrls ?? [] : [];
  progress(2, 2);
  return { host, port, servername: handshake.servername, protocol: handshake.protocol, chain: handshake.chain, trust, hostname, incompleteChain, missingIssuerUrls, ocspStapleBase64: handshake.ocspStapleBase64 };
}

export interface StartTlsResult {
  readonly host: string;
  readonly port: number;
  readonly protocol: StartTlsProtocol;
  readonly transcript: readonly string[];
  readonly upgraded: boolean;
  readonly tlsProtocol: string | null;
  readonly cipher: string | null;
  readonly alpn: string | null;
  readonly chain: HandshakeResult['chain'];
  readonly trust: readonly TrustVerdict[];
  readonly hostname: ReturnType<typeof analyzeHostname>;
  readonly error?: string;
}

/** STARTTLS Inspector (item 21): negotiate the upgrade, show the transcript, then inspect the TLS layer. */
export async function inspectStartTls(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<StartTlsResult> {
  const host = (request.target ?? '').trim();
  const protocol = request.starttlsProtocol!;
  const port = request.port || DEFAULT_STARTTLS_PORT[protocol];
  const upgrade = await startTlsUpgrade(protocol, host, port, signal, request.timeoutMs ?? 10_000);
  progress(1, 2);
  try {
    const handshake = await tlsHandshake({ host, port, servername: request.sni?.trim() || host, socket: upgrade.socket, alpn: request.alpn, clientIdentity: request.clientIdentity, timeoutMs: request.timeoutMs ?? 10_000, requestOcsp: true }, signal);
    const chainDer = chainDerFromSummaries(handshake.chain);
    const trust = handshake.chain.length ? (['mozilla', 'windows'] as const).map((store) => { try { return validateChain(chainDer, store); } catch (error) { return { store, trusted: false, reason: error instanceof Error ? error.message : String(error), path: [] }; } }) : [];
    progress(2, 2);
    return {
      host, port, protocol, transcript: upgrade.transcript, upgraded: true, tlsProtocol: handshake.protocol, cipher: handshake.cipher?.standardName ?? null, alpn: handshake.alpn,
      chain: handshake.chain, trust, hostname: handshake.chain.length ? analyzeHostname(host, handshake.chain[0]) : { host, matches: false, reasons: ['No certificate presented.'] },
    };
  } catch (error) {
    return { host, port, protocol, transcript: upgrade.transcript, upgraded: false, tlsProtocol: null, cipher: null, alpn: null, chain: [], trust: [], hostname: { host, matches: false, reasons: [] }, error: error instanceof Error ? error.message : String(error) };
  }
}

export const TLS_VERSION_ORDER: readonly TlsVersionName[] = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
export { trustStore };
