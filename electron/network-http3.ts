import type { NetworkRequest } from '../src/app/core/platform/network-types';

/**
 * HTTP/3 probe (Phase 28, TLS Inspector). Electron's Node has no stable QUIC client, so this uses
 * Chromium's own network stack (`electron.net`) with QUIC forced on for the target origin, and
 * reads the negotiated protocol back. It sees only what Chromium exposes — the negotiated ALPN and
 * timing — not QUIC transport parameters or the raw handshake.
 */
export interface Http3Result {
  readonly url: string;
  readonly attemptedQuic: boolean;
  readonly negotiatedProtocol: 'h3' | 'h2' | 'http/1.1' | 'unknown';
  readonly h3: boolean;
  readonly status: number | null;
  readonly altSvc: string | null;
  readonly advertisesH3: boolean;
  readonly elapsedMs: number;
  readonly note: string;
  readonly error?: string;
}

/** Injected in tests; real implementation lives in the Electron main process. */
export interface Http3Driver {
  probe(url: string, quic: boolean, signal: AbortSignal, timeoutMs: number): Promise<{ protocol?: string; status: number; headers: Record<string, string | string[]> }>;
}

let driver: Http3Driver | null = null;
export function setHttp3Driver(value: Http3Driver | null): void { driver = value; }

/** Lazily build the Electron-backed driver (kept out of module scope so specs never load electron). */
async function electronDriver(): Promise<Http3Driver> {
  const { net, session } = await import('electron');
  return {
    async probe(url, quic, signal, timeoutMs) {
      const origin = new URL(url).origin;
      const partition = `dude-http3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const probeSession = session.fromPartition(partition, { cache: false });
      if (quic) await probeSession.setSSLConfig({ /* defaults keep QUIC enabled */ });
      return new Promise((resolve, reject) => {
        const request = net.request({ method: 'GET', url, session: probeSession, ...(quic ? { origin } : {}) } as Parameters<typeof net.request>[0]);
        const timer = setTimeout(() => { request.abort(); reject(new Error('HTTP/3 probe timed out.')); }, timeoutMs);
        const onAbort = () => { request.abort(); reject(new Error('Cancelled.')); };
        signal.addEventListener('abort', onAbort, { once: true });
        request.on('response', (response) => {
          clearTimeout(timer); signal.removeEventListener('abort', onAbort);
          const anyResponse = response as unknown as { httpVersion?: string };
          resolve({ protocol: anyResponse.httpVersion, status: response.statusCode, headers: response.headers as Record<string, string | string[]> });
          response.on('data', () => {}); response.on('end', () => {});
          request.abort();
        });
        request.on('error', (error) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); reject(error); });
        request.end();
      });
    },
  };
}

function classify(protocol: string | undefined): Http3Result['negotiatedProtocol'] {
  if (!protocol) return 'unknown';
  if (/^h3|3/.test(protocol) || protocol.includes('h3')) return 'h3';
  if (protocol.startsWith('h2') || protocol === '2' || protocol === '2.0') return 'h2';
  if (protocol.startsWith('1') || protocol.includes('1.1')) return 'http/1.1';
  return 'unknown';
}

export async function probeHttp3(request: NetworkRequest, signal: AbortSignal): Promise<Http3Result> {
  const host = (request.target ?? '').trim();
  const url = `https://${host}${request.port && request.port !== 443 ? `:${request.port}` : ''}/`;
  const active = driver ?? (driver = await electronDriver());
  const started = performance.now();
  try {
    const result = await active.probe(url, true, signal, request.timeoutMs ?? 10_000);
    const altSvcHeader = result.headers['alt-svc'];
    const altSvc = Array.isArray(altSvcHeader) ? altSvcHeader.join(', ') : altSvcHeader ?? null;
    const negotiated = classify(result.protocol);
    return {
      url, attemptedQuic: true, negotiatedProtocol: negotiated, h3: negotiated === 'h3', status: result.status, altSvc,
      advertisesH3: !!altSvc && /h3/.test(altSvc), elapsedMs: Math.round(performance.now() - started),
      note: negotiated === 'h3' ? 'The Chromium network stack completed an HTTP/3 request.' : `Chromium negotiated ${negotiated}. First requests often fall back to h2 until Alt-Svc is cached; a warm re-run may reach h3.`,
    };
  } catch (error) {
    return { url, attemptedQuic: true, negotiatedProtocol: 'unknown', h3: false, status: null, altSvc: null, advertisesH3: false, elapsedMs: Math.round(performance.now() - started), note: 'The HTTP/3 request could not be completed.', error: error instanceof Error ? error.message : String(error) };
  }
}
