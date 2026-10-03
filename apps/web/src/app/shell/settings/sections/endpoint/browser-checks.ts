import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HUB_REALTIME_PATH } from '@dude/contracts/hub';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { SKEW_WARN_SECONDS } from './endpoint-format';

/** Pure functions behind the "This browser" panel; the service in `browser-checks.service.ts` only gathers their inputs. */

export type TrustVerdict = 'trusted' | 'unknown' | 'insecure';
export interface TrustResult {
  readonly verdict: TrustVerdict;
  readonly summary: string;
  readonly detail: string;
}

export interface ServiceWorkerState {
  readonly supported: boolean;
  readonly controlling: boolean;
  readonly registered: boolean;
}

export const serviceWorkerLabel = (sw: ServiceWorkerState): string =>
  !sw.supported ? 'Not supported' : sw.controlling ? 'Registered and controlling this page' : sw.registered ? 'Registered (not controlling this page yet)' : 'None';

/**
 * A page cannot ask whether the user clicked through a certificate warning. Chromium refuses service-worker registration on a
 * certificate error, so a registered worker implies the certificate is trusted; its absence only means "may not be trusted".
 */
export function assessTrust(input: { readonly isSecureContext: boolean; readonly protocol: string; readonly serviceWorker: ServiceWorkerState }): TrustResult {
  if (input.protocol !== 'https:' || !input.isSecureContext) {
    return { verdict: 'insecure', summary: 'Not a secure context', detail: 'This page was not loaded over trusted HTTPS, so install, offline and clipboard features are limited.' };
  }
  if (input.serviceWorker.registered || input.serviceWorker.controlling) {
    return { verdict: 'trusted', summary: 'Certificate trusted', detail: 'The service worker registered, and browsers refuse to register one on a certificate error.' };
  }
  return {
    verdict: 'unknown',
    summary: 'Certificate may not be trusted',
    detail: "Install the Hub's root (Settings › Endpoint › Certificate) or import a trusted certificate. The service worker has not registered, which is what happens after a certificate warning was bypassed.",
  };
}

export interface SkewResult {
  readonly seconds: number | null;
  readonly warn: boolean;
}

/** Hub clock minus browser clock, from an HTTP `Date` header (one-second resolution). */
export function clockSkew(serverDate: string | null, browserNowMs: number): SkewResult {
  if (serverDate === null) return { seconds: null, warn: false };
  const hub = Date.parse(serverDate);
  if (!Number.isFinite(hub)) return { seconds: null, warn: false };
  const seconds = Math.round((hub - browserNowMs) / 1000);
  return { seconds, warn: Math.abs(seconds) > SKEW_WARN_SECONDS };
}

export type OriginMatch = 'canonical' | 'proxy' | 'name' | 'unknown' | 'no-report';

/** Whether the page's origin is one the Hub is configured for: its canonical origin, the reverse-proxy public origin, or `https://<name>[:port]`. */
export function matchOrigin(origin: string, report: Pick<HubDiagnosticsReport, 'exposure'> | null): OriginMatch {
  if (report === null) return 'no-report';
  const { canonicalOrigin, proxy, names, port } = report.exposure;
  const norm = (o: string): string => o.replace(/\/+$/, '').toLowerCase();
  const here = norm(origin);
  if (canonicalOrigin !== null && norm(canonicalOrigin) === here) return 'canonical';
  if (proxy !== null && norm(proxy.publicOrigin) === here) return 'proxy';
  const host = (name: string): string => (name.includes(':') && !name.startsWith('[') ? `[${name}]` : name).toLowerCase();
  for (const name of names) {
    const base = `https://${host(name)}`;
    if (here === `${base}:${port}` || (port === 443 && here === base)) return 'name';
  }
  return 'unknown';
}

export const ORIGIN_COPY: Readonly<Record<OriginMatch, string>> = {
  canonical: "Matches the Hub's canonical origin.",
  proxy: "Matches the reverse proxy's public origin.",
  name: 'Matches one of the Hub names.',
  unknown: 'Not one of the names or origins this Hub is configured for. Links and device pairing use the canonical origin.',
  'no-report': "Sign in as the owner to compare this with the Hub's configured names.",
};

export interface RealtimeResult {
  readonly ok: boolean;
  readonly ms: number | null;
  readonly detail: string;
}

export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  send(data: string): void;
  close(): void;
}

export const REALTIME_PROBE_TIMEOUT_MS = 5_000;
/** Close code the Hub uses for a socket without a valid session: it was reached, it just needs a sign-in. */
const UNAUTHORIZED_CLOSE = 4001;

/** Opens a short-lived socket to the Hub's realtime path, sends `hello`, expects `welcome` within the timeout, then closes. Never rejects. */
export function probeRealtime(
  open: () => SocketLike,
  options: { readonly timeoutMs?: number; readonly now?: () => number; readonly setTimer?: typeof setTimeout; readonly clearTimer?: typeof clearTimeout } = {},
): Promise<RealtimeResult> {
  const timeoutMs = options.timeoutMs ?? REALTIME_PROBE_TIMEOUT_MS;
  const now = options.now ?? (() => Date.now());
  const setT = options.setTimer ?? setTimeout;
  const clearT = options.clearTimer ?? clearTimeout;
  return new Promise<RealtimeResult>((resolve) => {
    let socket: SocketLike;
    try {
      socket = open();
    } catch (error) {
      resolve({ ok: false, ms: null, detail: error instanceof Error ? error.message : 'The socket could not be opened.' });
      return;
    }
    const started = now();
    let done = false;
    const finish = (result: RealtimeResult): void => {
      if (done) return;
      done = true;
      clearT(timer);
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch { /* already closed */ }
      resolve(result);
    };
    const timer = setT(() => finish({ ok: false, ms: null, detail: `No welcome within ${Math.round(timeoutMs / 1000)} s. A proxy or firewall may be blocking WebSocket upgrades.` }), timeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL }));
    socket.onmessage = (event) => {
      let type: unknown;
      try { type = (JSON.parse(String(event.data)) as { type?: unknown }).type; } catch { type = null; }
      if (type === 'welcome') finish({ ok: true, ms: Math.max(0, now() - started), detail: 'The Hub welcomed this browser.' });
      else if (type === 'error') finish({ ok: false, ms: null, detail: 'The Hub answered the realtime hello with an error.' });
    };
    socket.onerror = () => finish({ ok: false, ms: null, detail: 'The realtime connection failed.' });
    socket.onclose = (event) => finish(event.code === UNAUTHORIZED_CLOSE
      ? { ok: true, ms: Math.max(0, now() - started), detail: 'The Hub is reachable over WebSocket; sign in to receive live updates.' }
      : { ok: false, ms: null, detail: `The connection closed before a welcome (code ${event.code}).` });
  });
}

export const realtimeUrl = (location: Pick<Location, 'protocol' | 'host'>): string => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${HUB_REALTIME_PATH}`;

/** The public local-CA root as a DER `.cer`, from its PEM; null when the PEM is not a certificate. */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> | null {
  const match = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/.exec(pem);
  if (match === null) return null;
  try {
    const binary = atob(match[1].replace(/\s+/g, ''));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
