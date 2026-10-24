import { Injectable, OnDestroy, computed, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, decodeFrame, encodeFrame, parseCollabDocKey } from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity, CollabFrameKind, CollabLink, CollabLinkControl, CollabLinkDown, CollabLinkEvents } from '@dude/collab-doc';
import { COLLAB_DOC_ERROR_CODES, COLLAB_MAX_CHANNELS } from '@dude/contracts/hub';
import type { CollabDocErrorCode } from '@dude/contracts/hub';
import { HUB_COLLAB } from './hub-collab.token';

/**
 * Where a document stands. `connecting`: no live subscription yet; `live`: subscribed and in step with the Hub; `reconnecting`: it was
 * (or the link was) live and is being restored, the Y.Doc keeps its local state and resyncs; `offline`: the link stopped for good
 * (session expired, Hub transferred, protocol mismatch); `unavailable`: this environment has no Hub collaboration; `refused`: the Hub
 * (or the 8-channel limit) refused this document, see `refusal`.
 */
export type CollabStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'unavailable' | 'refused';

/** One collaboratively edited document. Several `open` calls for a key share the same documents; each caller releases its own handle. */
export interface CollabSession {
  readonly docKey: string;
  /** The current Y.Doc. It is replaced (see `revision`) when the Hub dropped an update as too large and the copy diverged. */
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  /** Increments whenever `doc` and `awareness` were replaced: re-bind editors and observers. */
  readonly revision: Signal<number>;
  readonly status: Signal<CollabStatus>;
  /** The last code the Hub (or the local channel limit) refused this document with; `too-large` stays after the doc was reset. */
  readonly refusal: Signal<CollabDocErrorCode | null>;
  /** The identity the Hub stamps into this socket's presence; null before the first welcome. */
  readonly identity: Signal<CollabIdentity | null>;
  /** Whether the editor may change the text now: live, or (adapters that edit locally while down) reconnecting or offline. */
  readonly writable: Signal<boolean>;
  ytext(name: string): Y.Text;
  /** Gives the document back; the last release unsubscribes. Safe to call twice. */
  release(): void;
}

/** Origin of every change that came from the Hub, so it is never echoed back. */
const FROM_HUB = Symbol('collab-hub');

/**
 * Drops other clients' presence without `removeAwarenessStates`, which bumps their clock: the Hub re-sends each peer's state at its old
 * clock after the next subscription, and a bumped clock would make `applyAwarenessUpdate` ignore it until the peer next renews.
 */
function forgetPeers(awareness: Awareness, ids: readonly number[]): void {
  const removed = ids.filter((id) => awareness.states.delete(id));
  for (const id of ids) awareness.meta.delete(id);
  if (removed.length === 0) return;
  const change = { added: [], updated: [], removed };
  awareness.emit('change', [change, FROM_HUB]);
  awareness.emit('update', [change, FROM_HUB]);
}

type LinkState = 'connecting' | 'up' | 'retrying' | 'offline' | 'unavailable';

interface Entry {
  readonly docKey: string;
  refs: number;
  /** 1..8 while this document holds a channel on the socket, else null. */
  channel: number | null;
  doc: Y.Doc;
  awareness: Awareness;
  unwire: () => void;
  /** The Hub confirmed the subscription on the current socket. */
  subscribed: boolean;
  everLive: boolean;
  refused: CollabDocErrorCode | null;
  readonly status: WritableSignal<CollabStatus>;
  readonly refusal: WritableSignal<CollabDocErrorCode | null>;
  readonly revision: WritableSignal<number>;
}

const syncMessage = (write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder();
  write(encoder);
  return encoding.toUint8Array(encoder);
};

/**
 * Collaborative documents over the Hub's collaboration socket (PD-100, PD-114). One socket (through the `HUB_COLLAB` adapter) is shared
 * by every open document; each document gets a channel 1..8, a Y.Doc and an Awareness. On every (re)connect each open document is
 * subscribed again with its existing Y.Doc, and the y-protocols step 1 / step 2 exchange merges whatever either side missed.
 */
@Injectable({ providedIn: 'root' })
export class CollabDocService implements OnDestroy {
  private readonly transport = inject(HUB_COLLAB);
  private readonly entries = new Map<string, Entry>();
  private readonly byChannel = new Map<number, Entry>();
  private link: CollabLink | null = null;
  private linkState: LinkState = 'connecting';
  private readonly identitySignal = signal<CollabIdentity | null>(null);
  private readonly events: CollabLinkEvents = {
    welcome: (identity) => this.onWelcome(identity),
    control: (message) => this.onControl(message),
    frame: (data) => this.onFrame(data),
    down: (down) => this.onDown(down),
  };

  /** The identity of the current socket, shared by every session. */
  readonly identity: Signal<CollabIdentity | null> = this.identitySignal.asReadonly();

  open(docKey: string): CollabSession {
    const existing = this.entries.get(docKey);
    if (existing) {
      existing.refs += 1;
      return this.handle(existing);
    }
    const entry = this.createEntry(docKey);
    if (parseCollabDocKey(docKey) === null) return this.refuseLocally(entry, 'not-found');
    const channel = this.freeChannel();
    if (channel === null) return this.refuseLocally(entry, 'limit');
    entry.channel = channel;
    this.entries.set(docKey, entry);
    this.byChannel.set(channel, entry);
    this.ensureLink();
    this.setLocalPresence(entry);
    if (this.linkState === 'up') this.subscribe(entry);
    this.recompute(entry);
    return this.handle(entry);
  }

  ngOnDestroy(): void {
    this.link?.stop();
    this.link = null;
    for (const entry of this.entries.values()) {
      entry.unwire();
      entry.awareness.destroy();
    }
    this.entries.clear();
    this.byChannel.clear();
  }

  // --- sessions -------------------------------------------------------------------------------------------------

  private createEntry(docKey: string): Entry {
    const doc = new Y.Doc();
    const entry: Entry = {
      docKey, refs: 1, channel: null, doc, awareness: new Awareness(doc), unwire: () => undefined, subscribed: false, everLive: false, refused: null,
      status: signal<CollabStatus>('connecting'), refusal: signal<CollabDocErrorCode | null>(null), revision: signal(0),
    };
    this.wire(entry);
    return entry;
  }

  /** A session that never reaches the Hub (bad key, no free channel): refused, not registered, nothing to release. */
  private refuseLocally(entry: Entry, code: CollabDocErrorCode): CollabSession {
    entry.refused = code;
    entry.refusal.set(code);
    entry.status.set('refused');
    const session = this.handle(entry, () => {
      entry.unwire();
      entry.awareness.destroy();
    });
    return session;
  }

  private handle(entry: Entry, onLastRelease?: () => void): CollabSession {
    let released = false;
    const writable = computed(() => {
      const status = entry.status();
      return status === 'live' || (this.transport.editableWhenDown && (status === 'reconnecting' || status === 'offline'));
    });
    return {
      docKey: entry.docKey,
      get doc() { return entry.doc; },
      get awareness() { return entry.awareness; },
      revision: entry.revision.asReadonly(),
      status: entry.status.asReadonly(),
      refusal: entry.refusal.asReadonly(),
      identity: this.identity,
      writable,
      ytext: (name) => entry.doc.getText(name),
      release: () => {
        if (released) return;
        released = true;
        entry.refs -= 1;
        if (entry.refs > 0) return;
        if (onLastRelease) onLastRelease();
        else this.dispose(entry);
      },
    };
  }

  private dispose(entry: Entry): void {
    if (this.entries.get(entry.docKey) !== entry) return;
    if (this.linkState === 'up' && entry.subscribed && entry.awareness.getLocalState() !== null) entry.awareness.setLocalState(null);
    if (this.linkState === 'up' && entry.channel !== null && !entry.refused) this.link?.sendControl({ type: 'unsubscribe', channel: entry.channel });
    this.entries.delete(entry.docKey);
    if (entry.channel !== null) this.byChannel.delete(entry.channel);
    entry.channel = null;
    entry.subscribed = false;
    entry.unwire();
    entry.awareness.destroy();
    if (this.entries.size === 0) {
      this.link?.stop();
      this.link = null;
      this.linkState = 'connecting';
    }
  }

  private freeChannel(): number | null {
    for (let channel = 1; channel <= COLLAB_MAX_CHANNELS; channel += 1) if (!this.byChannel.has(channel)) return channel;
    return null;
  }

  private recompute(entry: Entry): void {
    const resumed = entry.everLive ? 'reconnecting' : 'connecting';
    let status: CollabStatus;
    if (entry.refused) status = 'refused';
    else if (this.linkState === 'unavailable') status = 'unavailable';
    else if (this.linkState === 'offline') status = 'offline';
    else if (this.linkState === 'retrying') status = 'reconnecting';
    else if (this.linkState === 'up' && entry.subscribed) status = 'live';
    else status = resumed;
    entry.status.set(status);
  }

  // --- document and presence wiring -----------------------------------------------------------------------------

  private wire(entry: Entry): void {
    const { doc, awareness } = entry;
    const onUpdate = (update: Uint8Array, origin: unknown): void => {
      if (origin === FROM_HUB || !entry.subscribed) return;
      this.sendFrame(entry, COLLAB_FRAME_SYNC, syncMessage((encoder) => syncProtocol.writeUpdate(encoder, update)));
    };
    const onAwareness = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown): void => {
      if (origin === FROM_HUB || !entry.subscribed) return;
      this.sendFrame(entry, COLLAB_FRAME_AWARENESS, encodeAwarenessUpdate(awareness, added.concat(updated, removed)));
    };
    doc.on('update', onUpdate);
    awareness.on('update', onAwareness);
    entry.unwire = () => {
      doc.off('update', onUpdate);
      awareness.off('update', onAwareness);
    };
  }

  /** Local presence is the Hub's stamped identity plus whatever cursor the editor binding set; the Hub overwrites `user` anyway. */
  private setLocalPresence(entry: Entry): void {
    const identity = this.identitySignal();
    if (identity === null) return;
    const current = entry.awareness.getLocalState() as { cursor?: unknown } | null;
    entry.awareness.setLocalState({ user: { deviceId: identity.deviceId, name: identity.name, colorSlot: identity.colorSlot }, cursor: current?.cursor ?? null });
  }

  // --- link -----------------------------------------------------------------------------------------------------

  private ensureLink(): void {
    if (this.link !== null) return;
    this.linkState = 'connecting';
    // An adapter may report `down` from inside `start` (unavailable): the state it sets must survive the assignment.
    this.link = this.transport.start(this.events);
    const after = this.linkState as LinkState;
    if (after === 'unavailable' || after === 'offline') this.link.stop();
  }

  private sendFrame(entry: Entry, kind: CollabFrameKind, payload: Uint8Array): void {
    if (this.linkState !== 'up' || entry.channel === null || !this.link) return;
    this.link.sendFrame(encodeFrame(entry.channel, kind, payload));
  }

  private subscribe(entry: Entry): void {
    if (entry.channel === null || entry.refused) return;
    this.link?.sendControl({ type: 'subscribe', channel: entry.channel, doc: entry.docKey });
  }

  private onWelcome(identity: CollabIdentity): void {
    this.linkState = 'up';
    this.identitySignal.set(identity);
    for (const entry of [...this.entries.values()]) {
      entry.subscribed = false;
      this.setLocalPresence(entry);
      this.subscribe(entry);
      this.recompute(entry);
    }
  }

  private onDown(down: CollabLinkDown): void {
    this.linkState = down.kind === 'retry' ? 'retrying' : down.reason === 'unavailable' ? 'unavailable' : 'offline';
    for (const entry of [...this.entries.values()]) {
      entry.subscribed = false;
      // Peers' presence belongs to the socket that is gone; the Hub sends it again after the next subscription.
      const others = [...entry.awareness.getStates().keys()].filter((id) => id !== entry.awareness.clientID);
      forgetPeers(entry.awareness, others);
      this.recompute(entry);
    }
  }

  private onControl(message: CollabLinkControl): void {
    if (message.type === 'subscribed') {
      const entry = this.byChannel.get(message.channel);
      if (!entry || entry.docKey !== message.doc) return;
      entry.subscribed = true;
      entry.everLive = true;
      this.recompute(entry);
      // The Hub sent its own step 1; ours asks for what this copy lacks, and our presence reaches the Hub's other subscribers.
      this.sendFrame(entry, COLLAB_FRAME_SYNC, syncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, entry.doc)));
      if (entry.awareness.getLocalState() !== null) {
        this.sendFrame(entry, COLLAB_FRAME_AWARENESS, encodeAwarenessUpdate(entry.awareness, [entry.awareness.clientID]));
      }
      return;
    }
    if (message.type !== 'doc-error') return;
    const entry = this.byChannel.get(message.channel);
    if (!entry) return;
    if (message.code === 'too-large') {
      this.resetDocument(entry);
      return;
    }
    // The Hub ended (or never began) this subscription: nothing is left on the channel, so it is free for another document.
    // A code from a newer Hub reads as unavailable: refused either way.
    const code = (COLLAB_DOC_ERROR_CODES as readonly string[]).includes(message.code) ? (message.code as CollabDocErrorCode) : 'unavailable';
    entry.refused = code;
    entry.refusal.set(code);
    entry.subscribed = false;
    this.byChannel.delete(message.channel);
    entry.channel = null;
    this.recompute(entry);
  }

  /**
   * The Hub dropped an update (the record would pass its size limit), so this copy holds a change the Hub never will. Start from a
   * fresh Y.Doc and subscribe again; the Hub's step 2 rebuilds the text and the local overshoot is gone. The session's `revision`
   * changes so editors re-bind.
   */
  private resetDocument(entry: Entry): void {
    entry.unwire();
    entry.awareness.destroy();
    entry.doc = new Y.Doc();
    entry.awareness = new Awareness(entry.doc);
    entry.subscribed = false;
    entry.refusal.set('too-large');
    this.wire(entry);
    this.setLocalPresence(entry);
    this.recompute(entry);
    entry.revision.update((value) => value + 1);
    if (entry.channel !== null && this.linkState === 'up') {
      this.link?.sendControl({ type: 'unsubscribe', channel: entry.channel });
      this.subscribe(entry);
    }
  }

  private onFrame(data: Uint8Array): void {
    const frame = decodeFrame(data);
    if (frame === null) return;
    const entry = this.byChannel.get(frame.channel);
    // Frames of a channel whose `subscribed` has not arrived (or was reset) belong to an earlier document or socket.
    if (!entry || !entry.subscribed) return;
    try {
      if (frame.kind === COLLAB_FRAME_SYNC) {
        const reply = encoding.createEncoder();
        syncProtocol.readSyncMessage(decoding.createDecoder(frame.payload), reply, entry.doc, FROM_HUB);
        if (encoding.length(reply) > 0) this.sendFrame(entry, COLLAB_FRAME_SYNC, encoding.toUint8Array(reply));
      } else {
        applyAwarenessUpdate(entry.awareness, frame.payload, FROM_HUB);
      }
    } catch {
      // A malformed message changes nothing; the next sync exchange recovers.
    }
  }
}
