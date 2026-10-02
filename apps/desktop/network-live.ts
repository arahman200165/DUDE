import type { NetworkKind, NetworkRequest } from "@dude/contracts/core/platform/network-types";

/**
 * Phase 28 (DNS & Live TLS / Certificate Tools) request dispatch. Kept separate from
 * `network-runner.ts` so the Phase 27 runner doesn't grow per tool; each live check lives in its
 * own `network-*.ts` module and is registered here.
 */
export type LiveProgress = (completed: number, total: number, data?: unknown) => void;

export const LIVE_KINDS: ReadonlySet<NetworkKind> = new Set<NetworkKind>([
  'dnssec-inspector', 'email-auth', 'tls-inspector', 'tls-enumeration', 'tls-capture',
  'http3-probe', 'live-chain', 'revocation', 'ct-lookup', 'starttls', 'https-analyzer',
]);

type Handler = (request: NetworkRequest, signal: AbortSignal, progress: LiveProgress) => Promise<unknown>;
type Preview = (request: NetworkRequest) => unknown;
const handlers = new Map<NetworkKind, Handler>();
const previews = new Map<NetworkKind, Preview>();
const timeouts = new Map<NetworkKind, number>();

export function registerLiveKind(kind: NetworkKind, handler: Handler, options: { preview?: Preview; timeoutMs?: number } = {}): void {
  handlers.set(kind, handler);
  if (options.preview) previews.set(kind, options.preview);
  if (options.timeoutMs) timeouts.set(kind, options.timeoutMs);
}

export function runLiveRequest(request: NetworkRequest, signal: AbortSignal, progress: LiveProgress): Promise<unknown> {
  const handler = handlers.get(request.kind);
  if (!handler) return Promise.reject(new Error('This live check is not available in this build.'));
  return handler(request, signal, progress);
}

export function livePreview(request: NetworkRequest): unknown {
  const preview = previews.get(request.kind);
  return preview ? preview(request) : { kind: request.kind, target: request.target, port: request.port };
}

export function liveTimeoutMs(request: NetworkRequest): number {
  return timeouts.get(request.kind) ?? 180_000;
}
