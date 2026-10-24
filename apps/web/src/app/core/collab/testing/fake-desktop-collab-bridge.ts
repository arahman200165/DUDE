import { fromBase64, toBase64 } from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity, CollabLink, CollabLinkEvents } from '@dude/collab-doc';
import type { CollabRefusalReason, CollabRelayFrame, CollabRelayState } from '@dude/contracts';
import type { DesktopCollabHubBridge, DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { FakeCollabHub, FakeCollabTransport } from './fake-collab-hub';

/**
 * `window.dude.collabHub` over a `FakeCollabHub`, standing in for main + the Device Agent: `open` is the Agent taking the pinned socket (it
 * says hello and the Hub welcomes at once), frames travel as the same JSON text and base64 the real relay carries, and a test can refuse the
 * open, fail it, drop the Agent's socket (the Agent reconnects by itself) or push any relay state. Frames the renderer sends are queued on the
 * hub like a real socket's; the test calls `hub.pump()`.
 */
export class FakeDesktopCollabBridge implements DesktopCollabHubBridge {
  opens = 0;
  closes = 0;
  /** Every frame the renderer asked to send, as the bridge received it. */
  readonly sent: CollabRelayFrame[] = [];
  /** While set, `open` answers a gate refusal. */
  refusal: { reason: CollabRefusalReason; message: string } | null = null;
  /** While set, `open` fails as a call (the Agent is not running). */
  openError: { code: string; message: string } | null = null;
  /** While set, `send` fails with this code. */
  sendError: string | null = null;
  private readonly transport: FakeCollabTransport;
  private link: CollabLink | null = null;
  private readonly frameListeners = new Set<(frame: CollabRelayFrame) => void>();
  private readonly stateListeners = new Set<(state: CollabRelayState) => void>();

  constructor(readonly hub: FakeCollabHub, readonly identity: CollabIdentity) {
    this.transport = new FakeCollabTransport(hub, identity);
  }

  get listening(): { frames: number; states: number } {
    return { frames: this.frameListeners.size, states: this.stateListeners.size };
  }

  async open(): Promise<DesktopHubResult<{ readonly ok: true } | { readonly ok: false; readonly reason: CollabRefusalReason; readonly message: string }>> {
    this.opens += 1;
    if (this.openError) return { ok: false, error: this.openError };
    if (this.refusal) return { ok: true, result: { ok: false, ...this.refusal } };
    this.link?.stop();
    const events: CollabLinkEvents = {
      welcome: (identity) => this.emitFrame({ kind: 'control', text: JSON.stringify({ type: 'welcome', protocolVersion: 3, sessionKind: 'device', deviceId: identity.deviceId, heartbeatIntervalMs: 25_000, identity }) }),
      control: (message) => this.emitFrame({ kind: 'control', text: JSON.stringify(message) }),
      frame: (data) => this.emitFrame({ kind: 'binary', base64: toBase64(data) }),
      down: () => undefined,
    };
    this.link = this.transport.start(events);
    this.emitState({ state: 'connecting' });
    this.transport.welcome();
    this.emitState({ state: 'open' });
    return { ok: true, result: { ok: true } };
  }

  async send(frame: CollabRelayFrame): Promise<DesktopHubResult<{ readonly ok: true }>> {
    this.sent.push(frame);
    if (this.sendError) return { ok: false, error: { code: this.sendError, message: this.sendError } };
    if (this.link === null) return { ok: false, error: { code: 'collab-not-open', message: 'not open' } };
    if (frame.kind === 'control') {
      this.link.sendControl(JSON.parse(frame.text));
    } else {
      const bytes = fromBase64(frame.base64);
      if (bytes === null) return { ok: false, error: { code: 'bad-request', message: 'bad base64' } };
      this.link.sendFrame(bytes);
    }
    return { ok: true, result: { ok: true } };
  }

  async close(): Promise<DesktopHubResult<{ readonly ok: true }>> {
    this.closes += 1;
    this.link?.stop();
    this.link = null;
    return { ok: true, result: { ok: true } };
  }

  onFrame(callback: (frame: CollabRelayFrame) => void): () => void {
    this.frameListeners.add(callback);
    return () => { this.frameListeners.delete(callback); };
  }

  onState(callback: (state: CollabRelayState) => void): () => void {
    this.stateListeners.add(callback);
    return () => { this.stateListeners.delete(callback); };
  }

  // test controls ------------------------------------------------------------------------------------------------

  emitFrame(frame: CollabRelayFrame): void {
    for (const listener of [...this.frameListeners]) listener(frame);
  }

  emitState(state: CollabRelayState): void {
    for (const listener of [...this.stateListeners]) listener(state);
  }

  /** The Agent's Hub socket drops; the Agent reconnects on its own (`willRetry`). The Hub forgets the subscriptions. */
  dropSocket(): void {
    this.transport.connection.drop();
    this.transport.connection.welcomed = false;
    this.emitState({ state: 'closed', code: 1006, reason: 'dropped', willRetry: true });
  }

  /** The Agent's reconnect succeeded: the Hub welcomes the same relay again. */
  restoreSocket(): void {
    this.transport.reconnect();
    this.emitState({ state: 'open' });
  }
}
