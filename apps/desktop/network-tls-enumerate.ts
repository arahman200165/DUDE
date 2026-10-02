import { getCiphers } from 'node:tls';
import type { NetworkRequest, TlsVersionName } from "@dude/contracts/core/platform/network-types";
import { tlsHandshake } from './network-tls';
import { startTlsUpgrade } from './network-starttls';
import { TLS_VERSION_ORDER, weaknessReport, type WeaknessFinding } from './network-tls-inspect';

/**
 * Cipher-suite and TLS-version enumeration (Phase 28 items 11, 12), gated behind preview/confirm
 * and tagged network-scanning. Each probe is a real OpenSSL handshake with a pinned version and
 * cipher; a cipher the client can't offer is reported "not testable from this client" rather than
 * claimed unsupported (Electron's BoringSSL omits legacy suites). Budget: <=128 handshakes,
 * <=4 concurrent.
 */
const MAX_HANDSHAKES = 128;
const CONCURRENCY = 4;

/** OpenSSL 1.3 suite name (tls_aes_128_gcm_sha256) → IANA (TLS_AES_128_GCM_SHA256). */
function tls13Ciphers(): { openssl: string }[] {
  return getCiphers().filter((name) => name.startsWith('tls_')).map((name) => ({ openssl: name.toUpperCase() }));
}
/** OpenSSL 1.2 suite names; the completed handshake reports the true IANA standard name. */
function tls12Ciphers(): { openssl: string }[] {
  return getCiphers().filter((name) => !name.startsWith('tls_')).map((name) => ({ openssl: name }));
}

export type ProbeState = 'supported' | 'rejected' | 'not-testable' | 'error';
export interface VersionProbe { readonly version: TlsVersionName; readonly state: ProbeState; readonly cipher?: string; readonly detail?: string }
export interface CipherProbe { readonly version: TlsVersionName; readonly openssl: string; readonly standardName?: string; readonly state: ProbeState; readonly detail?: string }
export interface EnumerationResult {
  readonly host: string;
  readonly port: number;
  readonly client: string;
  readonly handshakes: number;
  readonly budget: number;
  readonly versions: readonly VersionProbe[];
  readonly ciphers: readonly CipherProbe[];
  readonly supportedVersions: readonly TlsVersionName[];
  readonly weaknesses: readonly WeaknessFinding[];
  readonly notTestable: number;
  readonly note: string;
}

interface Budget { used: number }
async function connectWith(request: NetworkRequest, options: { minVersion: TlsVersionName; maxVersion: TlsVersionName; ciphers?: string }, signal: AbortSignal): Promise<Awaited<ReturnType<typeof tlsHandshake>>> {
  const host = (request.target ?? '').trim();
  const base = { host, port: request.port ?? 443, servername: request.sni?.trim() || host, timeoutMs: request.timeoutMs ?? 8000, requestOcsp: false, ...options };
  if (request.starttlsProtocol) {
    const upgraded = await startTlsUpgrade(request.starttlsProtocol, host, request.port ?? 0, signal, request.timeoutMs ?? 8000);
    return tlsHandshake({ ...base, socket: upgraded.socket }, signal);
  }
  return tlsHandshake(base, signal);
}

function classifyError(message: string): ProbeState {
  if (/no protocols available|unsupported protocol|no ciphers available|version too low|version too high|inappropriate fallback/i.test(message)) return 'rejected';
  if (/handshake failure|alert number (40|70)|no cipher match|alert handshake failure|protocol[ _]version|wrong version number|unexpected message|tlsv1 alert|sslv3 alert/i.test(message)) return 'rejected';
  if (/ECONNRESET|EPIPE|socket disconnected|closed before/i.test(message)) return 'rejected';
  return 'error';
}

async function runPool<T, R>(items: readonly T[], signal: AbortSignal, budget: Budget, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      if (signal.aborted) throw new Error('Cancelled.');
      if (budget.used >= MAX_HANDSHAKES) return;
      const index = next++;
      budget.used++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

export function enumerationPlan(request: NetworkRequest): { versions: number; ciphers: number; total: number } {
  const versions = TLS_VERSION_ORDER.length;
  const ciphers = tls12Ciphers().length + tls13Ciphers().length;
  return { versions, ciphers, total: Math.min(MAX_HANDSHAKES, versions + ciphers) };
}

export async function enumerateTls(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<EnumerationResult> {
  const host = (request.target ?? '').trim();
  const port = request.port ?? 443;
  const budget: Budget = { used: 0 };
  const plan = enumerationPlan(request);
  let done = 0;
  const tick = (data?: unknown) => progress(++done, plan.total, data);

  // Versions: probe each with min=max, no cipher pin.
  const versions = await runPool(TLS_VERSION_ORDER, signal, budget, async (version): Promise<VersionProbe> => {
    try {
      const handshake = await connectWith(request, { minVersion: version, maxVersion: version }, signal);
      const probe: VersionProbe = { version, state: 'supported', cipher: handshake.cipher?.standardName };
      tick(probe); return probe;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const state = classifyError(message);
      const probe: VersionProbe = { version, state, ...(state === 'error' ? { detail: message } : {}) };
      tick(probe); return probe;
    }
  });
  const supportedVersions = versions.filter((probe) => probe.state === 'supported').map((probe) => probe.version);

  // Ciphers: TLS 1.2 suites against the highest supported <=1.2 version, TLS 1.3 suites if 1.3 is up.
  const twelve = supportedVersions.includes('TLSv1.2') ? 'TLSv1.2' : supportedVersions.find((v) => v === 'TLSv1.1' || v === 'TLSv1');
  const cipherProbes: CipherProbe[] = [];
  if (twelve) {
    const list = tls12Ciphers();
    const probes = await runPool(list, signal, budget, async (cipher): Promise<CipherProbe> => {
      if (budget.used > MAX_HANDSHAKES) return { version: twelve, openssl: cipher.openssl, state: 'not-testable', detail: 'handshake budget reached' };
      try {
        const handshake = await connectWith(request, { minVersion: twelve, maxVersion: 'TLSv1.2', ciphers: `${cipher.openssl.toUpperCase()}:@SECLEVEL=0` }, signal);
        const probe: CipherProbe = { version: twelve, openssl: cipher.openssl, standardName: handshake.cipher?.standardName, state: 'supported' };
        tick(probe); return probe;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const probe: CipherProbe = { version: twelve, openssl: cipher.openssl, state: classifyError(message), ...(classifyError(message) === 'error' ? { detail: message } : {}) };
        tick(probe); return probe;
      }
    });
    cipherProbes.push(...probes);
  }
  if (supportedVersions.includes('TLSv1.3')) {
    const list = tls13Ciphers();
    const probes = await runPool(list, signal, budget, async (cipher): Promise<CipherProbe> => {
      try {
        const handshake = await connectWith(request, { minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', ciphers: cipher.openssl }, signal);
        const probe: CipherProbe = { version: 'TLSv1.3', openssl: cipher.openssl, standardName: handshake.cipher?.standardName, state: 'supported' };
        tick(probe); return probe;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const probe: CipherProbe = { version: 'TLSv1.3', openssl: cipher.openssl, state: classifyError(message), ...(classifyError(message) === 'error' ? { detail: message } : {}) };
        tick(probe); return probe;
      }
    });
    cipherProbes.push(...probes);
  }

  // Weaknesses from the strongest handshake actually completed, plus enumeration-derived ones.
  const strongest = supportedVersions.at(-1);
  let weaknesses: WeaknessFinding[] = [];
  if (strongest) {
    try { weaknesses = weaknessReport(await connectWith(request, { minVersion: strongest, maxVersion: strongest }, signal)); }
    catch { weaknesses = []; }
  }
  if (supportedVersions.includes('TLSv1') || supportedVersions.includes('TLSv1.1')) weaknesses.unshift({ id: 'enum-legacy', status: 'fail', title: `Legacy protocol still offered: ${supportedVersions.filter((v) => v === 'TLSv1' || v === 'TLSv1.1').join(', ')}`, reference: 'RFC 8996' });
  if (!supportedVersions.includes('TLSv1.3')) weaknesses.push({ id: 'enum-no13', status: 'warn', title: 'TLS 1.3 is not offered' });
  const supportedCiphers = cipherProbes.filter((probe) => probe.state === 'supported');
  for (const [pattern, id, title] of [[/RC4/i, 'enum-rc4', 'RC4 cipher offered'], [/3DES|DES-CBC3|DES_CBC3/i, 'enum-3des', '3DES cipher offered (SWEET32)'], [/(^|-)DES-|_NULL|NULL-|EXP-|EXPORT|ADH|AECDH|-anon/i, 'enum-weak', 'Weak or anonymous cipher offered']] as const) {
    const hit = supportedCiphers.filter((probe) => pattern.test(probe.standardName ?? probe.openssl));
    if (hit.length) weaknesses.push({ id, status: 'fail', title: `${title}: ${hit.map((probe) => probe.openssl).join(', ')}` });
  }
  const notTestable = cipherProbes.filter((probe) => probe.state === 'not-testable').length + versions.filter((probe) => probe.state === 'not-testable').length;
  return {
    host, port, client: `Electron ${process.versions.electron ?? ''} (BoringSSL)`, handshakes: budget.used, budget: MAX_HANDSHAKES,
    versions, ciphers: cipherProbes, supportedVersions, weaknesses, notTestable,
    note: 'Ciphers this client cannot offer are reported as "not testable from this client", never as unsupported. This build\'s TLS library omits many legacy suites (SSLv3, EXPORT, some RC4/DES), so their absence here is not proof the server rejects them.',
  };
}
