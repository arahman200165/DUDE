import { hostCrypto } from "@dude/crypto/host";
/**
 * Framework-free `postMessage` request/response correlation for one plugin
 * iframe — the same `requestId`-keyed pending-map pattern used by
 * `WorkerClientService`/`worker-protocol.ts`, just carried over a
 * `postMessage` channel to a sandboxed iframe instead of a `Worker`.
 * Pure and independently testable without a real iframe: simulate a
 * response by calling `handleMessage` directly.
 */

export interface PluginHostRequest {
  readonly requestId: string;
  readonly input: string;
}

export type PluginHostResponse =
  | { readonly requestId: string; readonly ok: true; readonly output: string }
  | { readonly requestId: string; readonly ok: false; readonly error: string };

function isPluginHostResponse(data: unknown): data is PluginHostResponse {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record['requestId'] === 'string' && typeof record['ok'] === 'boolean';
}

const DEFAULT_TIMEOUT_MS = 2000;

export class PluginRuntimeClient {
  private readonly pending = new Map<string, { resolve: (output: string) => void; reject: (error: string) => void }>();

  /** Feed every `message` event's `data` here; ignores anything that isn't a matching pending response. */
  handleMessage(data: unknown): void {
    if (!isPluginHostResponse(data)) return;
    const entry = this.pending.get(data.requestId);
    if (!entry) return;
    this.pending.delete(data.requestId);
    if (data.ok) entry.resolve(data.output);
    else entry.reject(data.error);
  }

  /** Sends one request via the given `postMessage` callback and resolves/rejects when a matching response arrives (or on timeout). */
  send(postMessage: (request: PluginHostRequest) => void, input: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const requestId = hostCrypto().randomUUID();

    return new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Plugin timed out.'));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (output) => {
          clearTimeout(timeoutHandle);
          resolve(output);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          reject(new Error(error));
        },
      });

      postMessage({ requestId, input });
    });
  }

  /** Number of requests still awaiting a response — mainly for tests/diagnostics. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
