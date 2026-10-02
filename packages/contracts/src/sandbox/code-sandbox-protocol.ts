/**
 * Wire protocol between a `CodeSandboxHost` iframe and the `CodeSandboxClient`
 * that drives it. Mirrors `worker-protocol.ts`'s `{id, kind, ...}` shape, but
 * one `run` can stream several `log` events before a terminal `result` /
 * `error` / `terminated` event, unlike a plain Worker job's single response.
 */

export interface SandboxRunRequest {
  readonly kind: 'run';
  readonly requestId: string;
  readonly code: string;
  readonly timeoutMs: number;
}

export interface SandboxCancelRequest {
  readonly kind: 'cancel';
  readonly requestId: string;
}

export type SandboxHostRequest = SandboxRunRequest | SandboxCancelRequest;

export type SandboxLogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface SandboxLogEvent {
  readonly kind: 'log';
  readonly requestId: string;
  readonly level: SandboxLogLevel;
  readonly args: readonly string[];
}

export interface SandboxResultEvent {
  readonly kind: 'result';
  readonly requestId: string;
  readonly value: string | null;
  readonly durationMs: number;
}

export type SandboxErrorSource = 'uncaught' | 'unhandledrejection' | 'thrown';

export interface SandboxErrorEvent {
  readonly kind: 'error';
  readonly requestId: string;
  readonly message: string;
  readonly name?: string;
  readonly stack?: string;
  readonly source: SandboxErrorSource;
}

export type SandboxTerminationReason = 'timeout' | 'cancelled' | 'log-flood';

export interface SandboxTerminatedEvent {
  readonly kind: 'terminated';
  readonly requestId: string;
  readonly reason: SandboxTerminationReason;
}

export type SandboxEvent = SandboxLogEvent | SandboxResultEvent | SandboxErrorEvent | SandboxTerminatedEvent;

const TERMINAL_KINDS: ReadonlySet<SandboxEvent['kind']> = new Set(['result', 'error', 'terminated']);

export function isTerminalSandboxEvent(event: SandboxEvent): boolean {
  return TERMINAL_KINDS.has(event.kind);
}

export function isSandboxEvent(data: unknown): data is SandboxEvent {
  if (typeof data !== 'object' || data === null) return false;
  const record = data as Record<string, unknown>;
  return typeof record['requestId'] === 'string' && typeof record['kind'] === 'string';
}
