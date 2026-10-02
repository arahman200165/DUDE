import { hostCrypto } from "@dude/crypto/host";
import { SandboxEvent, SandboxHostRequest, isSandboxEvent, isTerminalSandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";

/**
 * Framework-free `postMessage` correlation for one `CodeSandboxHost` iframe —
 * the same `requestId`-keyed pending-map pattern as `PluginRuntimeClient` /
 * `WorkerClientService`, but callback-based rather than a single Promise
 * since one run streams `log` events ahead of its terminal outcome. Pure and
 * independently testable without a real iframe: simulate a response by
 * calling `handleMessage` directly.
 */
export class CodeSandboxClient {
  private readonly pending = new Map<string, (event: SandboxEvent) => void>();

  /** Starts a run and returns a handle to cancel it. `onEvent` fires for every event up to and including the terminal one. */
  run(
    post: (request: SandboxHostRequest) => void,
    code: string,
    timeoutMs: number,
    onEvent: (event: SandboxEvent) => void,
  ): { requestId: string; cancel(): void } {
    const requestId = hostCrypto().randomUUID();
    this.pending.set(requestId, onEvent);
    post({ kind: 'run', requestId, code, timeoutMs });

    return {
      requestId,
      cancel: () => {
        if (!this.pending.has(requestId)) return;
        post({ kind: 'cancel', requestId });
      },
    };
  }

  /** Feed every `message` event's `data` here; ignores anything that isn't a matching, still-pending run. */
  handleMessage(data: unknown): void {
    if (!isSandboxEvent(data)) return;
    const onEvent = this.pending.get(data.requestId);
    if (!onEvent) return;
    if (isTerminalSandboxEvent(data)) this.pending.delete(data.requestId);
    onEvent(data);
  }

  /** Number of runs still awaiting a terminal event — mainly for tests/diagnostics. */
  get pendingCount(): number {
    return this.pending.size;
  }
}
