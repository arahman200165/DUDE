import type { AgentConnection, AgentConnectConfig, AgentTransport } from './agent-transport';

/** Test doubles for the agent connection; used only by specs. */
export class FakeConnection implements AgentConnection {
  boot: unknown = undefined;
  readonly sent: unknown[] = [];
  closeCalls = 0;
  private messageListener: ((message: unknown) => void) | null = null;
  private closeListener: (() => void) | null = null;
  /** Hook for in-process agents: called for every message the host posts. */
  onPost: ((message: unknown) => void) | null = null;
  /** Set true so `close()` does not end the connection (simulates a hung agent). */
  ignoreClose = false;
  post(message: unknown): void { this.sent.push(message); this.onPost?.(message); }
  onMessage(listener: (message: unknown) => void): void { this.messageListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }
  close(): void { this.closeCalls++; if (!this.ignoreClose) this.drop(); }
  /** The agent speaks to the host. */
  deliver(data: unknown): void { this.messageListener?.(data); }
  /** The connection ends (agent exit, crash or kill). */
  drop(): void { const listener = this.closeListener; this.closeListener = null; listener?.(); }
}

export interface Attempt {
  conn: FakeConnection;
  config: AgentConnectConfig;
  /** The agent accepted the connection and sent its ready payload. */
  resolve(boot: unknown): void;
  /** Nobody is listening / the handshake failed. */
  reject(error: Error): void;
}

export interface Harness {
  transport: AgentTransport;
  attempts: Attempt[];
  spawns: { count: number };
}

export function makeHarness(onAttempt?: (attempt: Attempt) => void): Harness {
  const attempts: Attempt[] = [];
  const spawns = { count: 0 };
  const transport: AgentTransport = {
    spawn: () => { spawns.count++; },
    connect: (config) => new Promise<AgentConnection>((resolve, reject) => {
      const conn = new FakeConnection();
      const attempt: Attempt = {
        conn, config,
        resolve: (boot) => { conn.boot = boot; resolve(conn); },
        reject,
      };
      attempts.push(attempt);
      onAttempt?.(attempt);
    }),
  };
  return { transport, attempts, spawns };
}
