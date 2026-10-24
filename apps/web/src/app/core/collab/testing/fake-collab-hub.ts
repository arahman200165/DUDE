import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, decodeFrame, encodeFrame, rewriteAwarenessUpdate } from '@dude/collab-doc';
import type { CollabAwarenessIdentity as CollabIdentity, CollabFrameKind, CollabLink, CollabLinkControl, CollabLinkDown, CollabLinkEvents, CollabSubscriptionControl, CollabTransport } from '@dude/collab-doc';
import type { CollabDocErrorCode } from '@dude/contracts/hub';

interface HubSub {
  readonly connection: FakeConnection;
  readonly channel: number;
  readonly docKey: string;
  readonly controlled: Set<number>;
}

interface HubRoom {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly subs: Set<HubSub>;
}

/** An update that adds structs or deletions (an empty step 2 changes nothing and is never refused). */
const carriesChanges = (update: Uint8Array): boolean => {
  const decoded = Y.decodeUpdate(update);
  return decoded.structs.length > 0 || decoded.ds.clients.size > 0;
};

const sync = (write: (encoder: encoding.Encoder) => void): Uint8Array => {
  const encoder = encoding.createEncoder();
  write(encoder);
  return encoding.toUint8Array(encoder);
};

/**
 * An in-memory stand-in for the Hub's collaboration socket, built on the same y-protocols calls the real one makes, so two services
 * can converge through it. Delivery is queued, never re-entrant: `pump()` runs both directions until nothing is in flight.
 */
export class FakeCollabHub {
  readonly rooms = new Map<string, HubRoom>();
  /** docKey -> code the Hub answers a subscription with. */
  readonly refusals = new Map<string, CollabDocErrorCode>();
  /** While set, every sync write from a client is refused with `too-large` and not applied. */
  rejectUpdates = false;
  readonly connections = new Set<FakeConnection>();
  private readonly pending: Array<() => void> = [];

  schedule(task: () => void): void {
    this.pending.push(task);
  }

  pump(): void {
    for (let guard = 0; this.pending.length > 0; guard += 1) {
      if (guard > 10_000) throw new Error('FakeCollabHub did not settle');
      this.pending.shift()!();
    }
  }

  room(docKey: string): HubRoom {
    let room = this.rooms.get(docKey);
    if (!room) {
      const doc = new Y.Doc();
      const awareness = new Awareness(doc);
      awareness.setLocalState(null);
      const created: HubRoom = { doc, awareness, subs: new Set() };
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        for (const sub of created.subs) {
          if (sub === origin) continue;
          sub.connection.toClient(sub.channel, COLLAB_FRAME_SYNC, sync((encoder) => syncProtocol.writeUpdate(encoder, update)));
        }
      });
      awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const owner = origin as HubSub;
        if (created.subs.has(owner)) for (const id of added.concat(updated)) owner.controlled.add(id);
        const payload = encodeAwarenessUpdate(awareness, added.concat(updated, removed));
        for (const sub of created.subs) if (sub !== origin) sub.connection.toClient(sub.channel, COLLAB_FRAME_AWARENESS, payload);
      });
      this.rooms.set(docKey, created);
      room = created;
    }
    return room;
  }

  /** The text the Hub holds for `docKey` (the Y.Text named `name`). */
  text(docKey: string, name = 'body'): string {
    return this.room(docKey).doc.getText(name).toString();
  }

  /** The Hub ends one subscription (consent revoked, document gone). */
  end(docKey: string, code: CollabDocErrorCode): void {
    for (const connection of this.connections) connection.endSub(docKey, code);
  }
}

export class FakeConnection implements CollabLink {
  readonly subs = new Map<number, HubSub>();
  /** Every control message the client sent on this connection, in order. */
  readonly controls: CollabSubscriptionControl[] = [];
  open = true;
  welcomed = false;
  stopped = false;

  constructor(readonly hub: FakeCollabHub, readonly events: CollabLinkEvents, readonly identity: CollabIdentity) {}

  // client -> hub ------------------------------------------------------------------------------------------------

  sendControl(message: CollabSubscriptionControl): void {
    if (!this.open || !this.welcomed) return;
    this.controls.push(message);
    this.hub.schedule(() => this.handleControl(message));
  }

  sendFrame(frame: Uint8Array): void {
    if (!this.open || !this.welcomed) return;
    this.hub.schedule(() => this.handleFrame(frame));
  }

  stop(): void {
    this.stopped = true;
    this.drop();
  }

  // hub -> client ------------------------------------------------------------------------------------------------

  toClient(channel: number, kind: CollabFrameKind, payload: Uint8Array): void {
    const frame = encodeFrame(channel, kind, payload);
    this.hub.schedule(() => {
      if (this.open && this.welcomed) this.events.frame(frame);
    });
  }

  private control(message: CollabLinkControl): void {
    this.hub.schedule(() => {
      if (this.open && this.welcomed) this.events.control(message);
    });
  }

  private handleControl(message: CollabSubscriptionControl): void {
    if (!this.open) return;
    if (message.type === 'unsubscribe') {
      const sub = this.subs.get(message.channel);
      if (sub) this.teardown(sub);
      return;
    }
    const refusal = this.hub.refusals.get(message.doc);
    if (refusal) {
      this.control({ type: 'doc-error', channel: message.channel, code: refusal });
      return;
    }
    if (this.subs.has(message.channel) || [...this.subs.values()].some((s) => s.docKey === message.doc)) {
      this.control({ type: 'doc-error', channel: message.channel, code: 'limit' });
      return;
    }
    const room = this.hub.room(message.doc);
    const sub: HubSub = { connection: this, channel: message.channel, docKey: message.doc, controlled: new Set() };
    this.subs.set(message.channel, sub);
    room.subs.add(sub);
    this.control({ type: 'subscribed', channel: message.channel, doc: message.doc });
    this.toClient(sub.channel, COLLAB_FRAME_SYNC, sync((encoder) => syncProtocol.writeSyncStep1(encoder, room.doc)));
    const present = [...room.awareness.getStates().keys()];
    if (present.length > 0) this.toClient(sub.channel, COLLAB_FRAME_AWARENESS, encodeAwarenessUpdate(room.awareness, present));
  }

  private handleFrame(data: Uint8Array): void {
    if (!this.open) return;
    const frame = decodeFrame(data);
    const sub = frame ? this.subs.get(frame.channel) : undefined;
    if (!frame || !sub) throw new Error('FakeCollabHub: protocol error (frame for an unknown channel)');
    const room = this.hub.room(sub.docKey);
    if (frame.kind === COLLAB_FRAME_AWARENESS) {
      const rewritten = rewriteAwarenessUpdate(frame.payload, this.identity);
      if (rewritten) applyAwarenessUpdate(room.awareness, rewritten, sub);
      return;
    }
    const decoder = decoding.createDecoder(frame.payload);
    const type = decoding.readVarUint(decoder);
    if (type !== syncProtocol.messageYjsSyncStep1 && this.hub.rejectUpdates && carriesChanges(decoding.readVarUint8Array(decoder))) {
      this.control({ type: 'doc-error', channel: sub.channel, code: 'too-large' });
      return;
    }
    const reply = encoding.createEncoder();
    const again = decoding.createDecoder(frame.payload);
    syncProtocol.readSyncMessage(again, reply, room.doc, sub);
    if (encoding.length(reply) > 0) this.toClient(sub.channel, COLLAB_FRAME_SYNC, encoding.toUint8Array(reply));
  }

  endSub(docKey: string, code: CollabDocErrorCode): void {
    for (const sub of [...this.subs.values()]) {
      if (sub.docKey !== docKey) continue;
      this.teardown(sub);
      this.control({ type: 'doc-error', channel: sub.channel, code });
    }
  }

  private teardown(sub: HubSub): void {
    this.subs.delete(sub.channel);
    const room = this.hub.room(sub.docKey);
    room.subs.delete(sub);
    if (sub.controlled.size > 0) removeAwarenessStates(room.awareness, [...sub.controlled], 'disconnect');
    sub.controlled.clear();
  }

  /** The socket dies: the Hub forgets its subscriptions and presence. */
  drop(): void {
    if (!this.open) return;
    this.open = false;
    for (const sub of [...this.subs.values()]) this.teardown(sub);
    this.hub.connections.delete(this);
  }
}

/** A transport onto a `FakeCollabHub`, driven by hand: `welcome()` completes a connect, `drop()` loses the link. */
export class FakeCollabTransport implements CollabTransport {
  readonly started: FakeConnection[] = [];
  editableWhenDown = false;

  constructor(readonly hub: FakeCollabHub, readonly identity: CollabIdentity) {}

  start(events: CollabLinkEvents): CollabLink {
    const connection = new FakeConnection(this.hub, events, this.identity);
    this.started.push(connection);
    return connection;
  }

  /** The latest connection (the one a service is using). */
  get connection(): FakeConnection {
    return this.started.at(-1)!;
  }

  /** The latest connection finishes hello/welcome. */
  welcome(): void {
    const connection = this.connection;
    connection.welcomed = true;
    this.hub.connections.add(connection);
    connection.events.welcome(connection.identity);
    this.hub.pump();
  }

  /** The link is lost; `retry` adapters then bring up a new connection with `reconnect()`. */
  drop(down: CollabLinkDown = { kind: 'retry' }): void {
    const connection = this.connection;
    connection.drop();
    connection.welcomed = false;
    connection.events.down(down);
    this.hub.pump();
  }

  /** The adapter's retry: the same link comes back on a new socket that welcomes at once. */
  reconnect(): void {
    this.connection.open = true;
    this.welcome();
  }
}
