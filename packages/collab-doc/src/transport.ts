import type { CollabAwarenessIdentity } from './awareness.js';

/** Why a link will not come back by itself: the page (or the user) has to act. */
export type CollabTerminalReason = 'unavailable' | 'session-expired' | 'transferred' | 'incompatible';

/** A lost link: `retry` means the adapter reconnects on its own, `terminal` means it stopped for good. */
export type CollabLinkDown =
  | { readonly kind: 'retry' }
  | { readonly kind: 'terminal'; readonly reason: CollabTerminalReason };

/**
 * The control messages the Hub sends after the welcome (`CollabServerControl` in `@dude/contracts/hub`, narrowed to what a
 * subscription acts on). `code` is the Hub's own string: the consumer maps codes it does not know.
 */
export type CollabLinkControl =
  | { readonly type: 'subscribed'; readonly channel: number; readonly doc: string }
  | { readonly type: 'doc-error'; readonly channel: number; readonly code: string }
  | { readonly type: 'error'; readonly code: string };

/** What an adapter reports to the collaboration service. Everything arrives on the caller's thread, in wire order. */
export interface CollabLinkEvents {
  /** The link is ready (every successful (re)connect, after hello and welcome): `identity` is what the Hub stamps into presence. */
  welcome(identity: CollabAwarenessIdentity): void;
  /** A `subscribed`, `doc-error` or `error` control message from the Hub. */
  control(message: CollabLinkControl): void;
  /** One binary frame `[channel][kind][payload]`, exactly as the Hub sent it. */
  frame(data: Uint8Array): void;
  /** The link went down. Frames sent after this and before the next `welcome` are dropped by the adapter. */
  down(down: CollabLinkDown): void;
}

/** The subscription controls a client sends; hello and heartbeat belong to the adapter. */
export type CollabSubscriptionControl =
  | { readonly type: 'subscribe'; readonly channel: number; readonly doc: string }
  | { readonly type: 'unsubscribe'; readonly channel: number };

export interface CollabLink {
  sendControl(message: CollabSubscriptionControl): void;
  sendFrame(frame: Uint8Array): void;
  /** Closes the link without a `down` event; the adapter stops reconnecting. */
  stop(): void;
}

/**
 * The environment's way to reach Hub collaboration (PD-114): Hub web (same-origin socket), the desktop (the Device Agent relays opaque
 * frames over IPC) or nothing (Pages, standalone). The adapter owns hello, heartbeat, reconnect and credential handling; the service
 * owns documents, channels and the y-protocols exchange.
 */
export interface CollabTransport {
  /**
   * Whether a document stays editable while the link is down and comes back (the desktop saves locally and syncs later). Hub web
   * writes are online-only, so its editor turns read-only until the link is live again.
   */
  readonly editableWhenDown: boolean;
  start(events: CollabLinkEvents): CollabLink;
}
