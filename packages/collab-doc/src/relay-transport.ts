import { isCollabAwarenessIdentity } from './awareness.js';
import type { CollabLink, CollabLinkControl, CollabLinkEvents, CollabSubscriptionControl, CollabTerminalReason, CollabTransport } from './transport.js';

/** A frame the Device Agent relays between the Hub's collaboration socket and the renderer (`CollabRelayFrame` in `@dude/contracts`): a JSON control frame as text, a binary frame as base64. */
export type CollabRelayFrame = { readonly kind: 'control'; readonly text: string } | { readonly kind: 'binary'; readonly base64: string };
/** The relay's state push (`CollabRelayState` in `@dude/contracts`). */
export interface CollabRelayState { readonly state: 'connecting' | 'open' | 'closed'; readonly code?: number; readonly reason?: string; readonly willRetry?: boolean }
type RelayResult<T> = { readonly ok: true; readonly result: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
/** What `window.dude.collabHub` offers (`DesktopCollabHubBridge` in `@dude/contracts`); declared here so this package needs no contracts dependency. */
export interface CollabRelayBridge {
  open(): Promise<RelayResult<{ readonly ok: true } | { readonly ok: false; readonly reason: string; readonly message: string }>>;
  send(frame: CollabRelayFrame): Promise<RelayResult<{ readonly ok: true }>>;
  close(): Promise<RelayResult<{ readonly ok: true }>>;
  onFrame(callback: (frame: CollabRelayFrame) => void): () => void;
  onState(callback: (state: CollabRelayState) => void): () => void;
}

const isChannel = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

/**
 * Narrows an inbound Hub control message to the shapes a subscription acts on (`subscribed`, `doc-error`, `error`); anything else is dropped.
 * Shared by every adapter that reads the Hub's collaboration socket (Hub web's own socket, the desktop's Agent relay).
 */
export function toCollabLinkControl(message: Record<string, unknown>): CollabLinkControl | null {
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

/** The first and longest wait before the link asks the Agent again after a refusal or a lost Agent. */
export const RELAY_COLLAB_BACKOFF_MIN_MS = 1_000;
export const RELAY_COLLAB_BACKOFF_MAX_MS = 30_000;

/** What a reason that will not clear by itself means for a document: the link stops and the page (or the user) has to act. */
export function terminalReasonFor(reason: string | undefined): CollabTerminalReason {
  switch (reason) {
    case 'incompatible': return 'incompatible';
    case 'authority-changed': return 'transferred';
    case 'revoked': return 'session-expired';
    default: return 'unavailable';
  }
}

/**
 * Refusals that clear by themselves (`isCollabRefusalTransient` in `@dude/contracts`, which this package does not depend on; a web spec keeps the two equal).
 */
export const isTransientRefusal = (reason: unknown): boolean => reason === 'hub-offline' || reason === 'first-sync-pending';

/** Reasons that mean the Agent is simply not there right now (restarting, stopped): the renderer asks again. */
const isAgentGone = (reason: string | undefined): boolean => reason === 'agent-unavailable';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Hub collaboration over the desktop's Agent relay (PD-106, PD-114). The Y.Doc and the editor binding live here; the resident Device Agent holds the pinned
 * Hub socket and `window.dude.collabHub` relays opaque frames, so this adapter never sees a credential or a certificate. The Agent says hello,
 * heartbeats and reconnects by itself; the Hub's welcome and every other control frame arrive verbatim, so this link reads the identity and the
 * subscription results exactly like Hub web does.
 *
 * `open` is refused with a reason when the device cannot collaborate now: `hub-offline` and `first-sync-pending` clear by themselves, so the link
 * reports a retry and asks again with backoff (1 s to 30 s), anything else (not paired, revoked, authority changed, needs reconcile...) is terminal
 * and the document stays `offline`/`unavailable`. A closed state with `willRetry` means the Agent reconnects on its own (the link only reports the
 * retry); a closed state without it means the hold ended, and a transient reason or a lost Agent is asked for again. A document stays editable
 * while down (`editableWhenDown`): the editor saves locally and the outbox syncs it later.
 */
export function createRelayCollabTransport(bridge: () => CollabRelayBridge | undefined): CollabTransport {
  return { editableWhenDown: true, start: (events) => new RelayCollabLink(bridge, events) };
}

class RelayCollabLink implements CollabLink {
  private welcomed = false;
  private stopped = false;
  private openGeneration = 0;
  private backoff = RELAY_COLLAB_BACKOFF_MIN_MS;
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly bridge: () => CollabRelayBridge | undefined, private readonly events: CollabLinkEvents) {
    const hub = bridge();
    if (hub === undefined) {
      this.terminal('unavailable');
      return;
    }
    // Subscribed before `open`, so nothing the Agent pushes after its answer can be missed.
    this.unsubscribers.push(hub.onFrame((frame) => this.onFrame(frame)), hub.onState((state) => this.onState(state)));
    this.open();
  }

  sendControl(message: CollabSubscriptionControl): void {
    this.send({ kind: 'control', text: JSON.stringify(message) });
  }

  sendFrame(frame: Uint8Array): void {
    this.send({ kind: 'binary', base64: toBase64(frame) });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.welcomed = false;
    this.clearReopen();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    void this.bridge()?.close().catch(() => undefined);
  }

  private send(frame: CollabRelayFrame): void {
    const hub = this.bridge();
    if (!this.welcomed || hub === undefined) return;
    hub.send(frame).then((result) => {
      // The Agent no longer holds the socket for this window (it restarted or was taken over without a state push we could use): ask again.
      if (!result.ok && result.error.code === 'collab-not-open') this.lost();
    }, () => undefined);
  }

  private open(): void {
    if (this.stopped) return;
    const hub = this.bridge();
    if (hub === undefined) { this.terminal('unavailable'); return; }
    const generation = ++this.openGeneration;
    hub.open().then((result) => {
      if (this.stopped || generation !== this.openGeneration) return;
      if (!result.ok) {
        // The Agent is not running (starting, restarting) or the call failed: nothing is held, so ask again later. A refusal of the call
        // itself (forbidden, bad request) cannot be fixed by asking again.
        if (result.error.code === 'forbidden' || result.error.code === 'bad-request') this.terminal('unavailable');
        else this.retryLater();
        return;
      }
      if (!result.result.ok) {
        if (isTransientRefusal(result.result.reason)) this.retryLater();
        else this.terminal(terminalReasonFor(result.result.reason));
      }
    }, () => { if (!this.stopped && generation === this.openGeneration) this.retryLater(); });
  }

  /** The Agent no longer holds the socket for this link: report the loss and ask again. */
  private lost(): void {
    if (this.stopped) return;
    this.welcomed = false;
    this.retryLater();
  }

  private retryLater(): void {
    if (this.stopped) return;
    this.welcomed = false;
    this.events.down({ kind: 'retry' });
    if (this.reopenTimer !== null) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RELAY_COLLAB_BACKOFF_MAX_MS);
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      this.open();
    }, delay);
  }

  private clearReopen(): void {
    if (this.reopenTimer !== null) clearTimeout(this.reopenTimer);
    this.reopenTimer = null;
  }

  private terminal(reason: CollabTerminalReason): void {
    if (this.stopped) return;
    this.stop();
    this.events.down({ kind: 'terminal', reason });
  }

  private onState(state: CollabRelayState): void {
    if (this.stopped || state.state !== 'closed') return;
    this.welcomed = false;
    // The Agent reconnects by itself and says so when it is back (a welcome frame follows).
    if (state.willRetry === true) {
      this.events.down({ kind: 'retry' });
      return;
    }
    if (isAgentGone(state.reason) || isTransientRefusal(state.reason)) {
      // The hold ended but will be possible again: ask again with backoff.
      this.clearReopen();
      this.retryLater();
      return;
    }
    this.terminal(terminalReasonFor(state.reason));
  }

  private onFrame(frame: CollabRelayFrame): void {
    if (this.stopped) return;
    if (frame.kind === 'binary') {
      const bytes = fromBase64(frame.base64);
      if (bytes !== null && this.welcomed) this.events.frame(bytes);
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(frame.text);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (message['type'] === 'welcome') {
      const identity = message['identity'];
      if (!isCollabAwarenessIdentity(identity)) {
        // A welcome without a usable identity is a Hub this build cannot collaborate with.
        this.terminal('incompatible');
        return;
      }
      this.welcomed = true;
      this.backoff = RELAY_COLLAB_BACKOFF_MIN_MS;
      this.events.welcome(identity);
      return;
    }
    if (!this.welcomed) return;
    const control = toCollabLinkControl(message);
    if (control !== null) this.events.control(control);
  }
}
