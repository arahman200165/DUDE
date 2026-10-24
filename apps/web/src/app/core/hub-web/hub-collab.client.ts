import { isCollabAwarenessIdentity } from '@dude/collab-doc';
import type { CollabLink, CollabLinkControl, CollabLinkEvents, CollabSubscriptionControl, CollabTransport } from '@dude/collab-doc';
import { HUB_COLLAB_PATH, HUB_PROTOCOL_VERSION, HUB_REALTIME_DEPTH_PROTOCOL, REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import type { HubWebConnectionService } from './hub-web-connection.service';
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS } from './hub-realtime.client';

/** The part of `WebSocket` this client uses, so tests can drive it without a network. */
export interface CollabSocketLike {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string | Uint8Array): void;
  close(code?: number): void;
}

export interface HubCollabDeps {
  readonly connection: Pick<HubWebConnectionService, 'set'>;
  /** The collaboration socket was closed for an expired or revoked session: sends the visitor to sign-in (nothing is wiped). */
  readonly goToSignIn?: () => void;
  readonly openSocket?: (url: string) => CollabSocketLike;
  readonly socketUrl?: () => string;
  readonly isVisible?: () => boolean;
}

/** Collaboration exists from protocol 3: the page asks the Hub for at least that. */
export const COLLAB_MIN_HUB_PROTOCOL = HUB_REALTIME_DEPTH_PROTOCOL;
const DEFAULT_HEARTBEAT_MS = 25_000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isChannel = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** Narrows an inbound control message to the shapes the service acts on; anything else is dropped. */
function toControl(message: Record<string, unknown>): CollabLinkControl | null {
  const { type, channel, doc, code } = message;
  switch (type) {
    case 'subscribed':
      return isChannel(channel) && typeof doc === 'string' ? { type, channel, doc } : null;
    case 'doc-error':
      return isChannel(channel) && typeof code === 'string' ? { type, channel, code } : null;
    case 'error':
      return typeof code === 'string' ? { type, code } : null;
    default:
      return null;
  }
}

function toBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/**
 * Hub web's collaboration link (PD-100, PD-114): one same-origin WebSocket to `/api/v1/collab`, authenticated by the owner cookie.
 * It says hello with the page's protocol and a minimum of 3, heartbeats at the announced interval, reconnects with exponential
 * backoff (1 s to 30 s) while the tab is visible, and reads close codes like the realtime link: 4001/4003 the session is gone,
 * 4004 the Hub moved, 4008 the page and Hub are incompatible; anything else is a dropped link and is retried. Edits are online-only
 * on Hub web, so the transport reports `editableWhenDown: false`.
 */
export function createHubCollabTransport(deps: HubCollabDeps): CollabTransport {
  return {
    editableWhenDown: false,
    start: (events) => new HubCollabLink(deps, events),
  };
}

class HubCollabLink implements CollabLink {
  private socket: CollabSocketLike | null = null;
  private welcomed = false;
  private stopped = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** A reconnect came due while the tab was hidden: it happens when the tab is shown again. */
  private waitingForVisible = false;
  private backoff = BACKOFF_MIN_MS;
  private readonly onVisible = (): void => {
    if (this.waitingForVisible && this.visible()) {
      this.waitingForVisible = false;
      this.connect();
    }
  };

  constructor(private readonly deps: HubCollabDeps, private readonly events: CollabLinkEvents) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  sendControl(message: CollabSubscriptionControl): void {
    if (!this.welcomed || this.socket === null) return;
    this.sendRaw(JSON.stringify(message));
  }

  sendFrame(frame: Uint8Array): void {
    if (!this.welcomed || this.socket === null) return;
    this.sendRaw(frame);
  }

  stop(): void {
    this.stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
    this.clearReconnect();
    this.closeSocket();
  }

  private sendRaw(data: string | Uint8Array): void {
    try {
      this.socket?.send(data);
    } catch {
      // the close handler takes over
    }
  }

  private visible(): boolean {
    return this.deps.isVisible ? this.deps.isVisible() : typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private url(): string {
    if (this.deps.socketUrl) return this.deps.socketUrl();
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${HUB_COLLAB_PATH}`;
  }

  private connect(): void {
    if (this.stopped) return;
    let socket: CollabSocketLike;
    try {
      socket = this.deps.openSocket ? this.deps.openSocket(this.url()) : (new WebSocket(this.url()) as unknown as CollabSocketLike);
    } catch {
      this.socketDown();
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', protocolVersion: HUB_PROTOCOL_VERSION, minHubProtocol: COLLAB_MIN_HUB_PROTOCOL }));
    socket.onmessage = (event) => this.onMessage(socket, event.data);
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.onClose(event.code);
    };
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.welcomed = false;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (socket) {
      socket.onclose = null;
      try {
        socket.close(1000);
      } catch {
        // already closed
      }
    }
  }

  private onMessage(socket: CollabSocketLike, data: unknown): void {
    if (this.socket !== socket) return;
    if (typeof data !== 'string') {
      const bytes = toBytes(data);
      if (bytes !== null && this.welcomed) this.events.frame(bytes);
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (message['type'] === 'welcome') {
      this.onWelcome(socket, message);
      return;
    }
    if (!this.welcomed) return;
    const control = toControl(message);
    if (control !== null) this.events.control(control);
  }

  private onWelcome(socket: CollabSocketLike, message: Record<string, unknown>): void {
    const identity = message['identity'];
    if (!isCollabAwarenessIdentity(identity)) {
      // A welcome without a usable identity is a Hub this page cannot collaborate with.
      this.terminal('incompatible');
      return;
    }
    this.welcomed = true;
    this.backoff = BACKOFF_MIN_MS;
    const announced = message['heartbeatIntervalMs'];
    const every = typeof announced === 'number' && announced > 0 ? announced : DEFAULT_HEARTBEAT_MS;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      try {
        socket.send(JSON.stringify({ type: 'heartbeat' }));
      } catch {
        // the close handler takes over
      }
    }, every);
    this.events.welcome(identity);
  }

  private onClose(code: number): void {
    this.welcomed = false;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (code === REALTIME_CLOSE_CODES.unauthorized || code === REALTIME_CLOSE_CODES.revoked) {
      this.deps.connection.set('session-expired');
      this.terminal('session-expired');
      this.deps.goToSignIn?.();
      return;
    }
    if (code === REALTIME_CLOSE_CODES.transferred) {
      this.deps.connection.set('transferred');
      this.terminal('transferred');
      return;
    }
    if (code === REALTIME_CLOSE_CODES.unsupportedProtocol) {
      this.deps.connection.set('incompatible');
      this.terminal('incompatible');
      return;
    }
    this.socketDown();
  }

  private terminal(reason: 'session-expired' | 'transferred' | 'incompatible'): void {
    if (this.stopped) return;
    this.stop();
    this.events.down({ kind: 'terminal', reason });
  }

  private socketDown(): void {
    if (this.stopped) return;
    this.events.down({ kind: 'retry' });
    if (this.reconnectTimer !== null || this.waitingForVisible) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.visible()) {
        this.waitingForVisible = true;
        return;
      }
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.waitingForVisible = false;
  }
}
