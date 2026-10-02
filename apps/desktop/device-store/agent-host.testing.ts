import type { ChannelFn, ForkFn, HostChild, HostPort } from './agent-host';

/** Test doubles for the utility process and MessageChannelMain; used only by specs. */
export class FakePort implements HostPort {
  readonly sent: unknown[] = [];
  closed = false;
  private handler: ((event: { data: unknown }) => void) | null = null;
  /** Hook for in-process agents: called for every message the host posts. */
  onPost: ((message: unknown) => void) | null = null;
  on(_event: 'message', listener: (event: { data: unknown }) => void): void { this.handler = listener; }
  postMessage(message: unknown): void { this.sent.push(message); this.onPost?.(message); }
  start(): void { /* no-op */ }
  close(): void { this.closed = true; }
  /** The agent speaks to the host. */
  deliver(data: unknown): void { this.handler?.({ data }); }
}

export class FakeChild implements HostChild {
  readonly posted: Array<{ message: unknown; transfer: unknown[] | undefined }> = [];
  killed = false;
  private exitHandler: ((code: number) => void) | null = null;
  /** Hook for in-process agents: called when main posts the init message. */
  onInit: ((message: unknown, transfer: unknown[]) => void) | null = null;
  /** Set true so `kill()` does not auto-exit (simulates a hung process). */
  ignoreKill = false;
  postMessage(message: unknown, transfer?: unknown[]): void {
    this.posted.push({ message, transfer });
    this.onInit?.(message, transfer ?? []);
  }
  once(_event: 'exit', listener: (code: number) => void): void { this.exitHandler = listener; }
  kill(): boolean { this.killed = true; if (!this.ignoreKill) this.exit(137); return true; }
  exit(code = 1): void { const h = this.exitHandler; this.exitHandler = null; h?.(code); }
}

export interface Harness {
  children: FakeChild[];
  ports: Array<{ port1: FakePort; port2: { tag: string } }>;
  fork: ForkFn;
  createChannel: ChannelFn;
}

export function makeHarness(onChild?: (child: FakeChild, channel: Harness['ports'][number]) => void): Harness {
  const children: FakeChild[] = [];
  const ports: Harness['ports'] = [];
  const h: Harness = {
    children,
    ports,
    fork: () => { const child = new FakeChild(); children.push(child); return child; },
    createChannel: () => { const channel = { port1: new FakePort(), port2: { tag: `port2-${ports.length}` } }; ports.push(channel); onChild?.(children[children.length - 1], channel); return channel; },
  };
  return h;
}
