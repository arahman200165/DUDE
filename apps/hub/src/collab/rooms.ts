import { randomBytes } from 'node:crypto';
import * as Y from 'yjs';
import { MARKDOWN_TEXT, contentBytes } from '@dude/collab-doc';
import { COLLAB_MAX_ROOMS, COLLAB_MAX_ROOM_PARTICIPANTS, COLLAB_ROOM_IDLE_CLOSE_MS } from '@dude/contracts/hub';
import type { CollabRoom } from '@dude/contracts/hub';
import { SYNC_LIMITS } from '@dude/sync';
import type { CollabApplyResult, CollabCloseReason, CollabDocHandle, CollabPrincipal } from './doc-registry.js';

/** Bytes of materialized JSON one update byte can add at most; below the cap at this bound the trial apply is skipped (as in the registry). */
const MAX_JSON_GROWTH_PER_UPDATE_BYTE = 6;

export interface CollabRoomsOptions {
  now: () => number;
  /** A room closes this long after its last participant left (or after it was created and nobody joined). Tests inject short ones. */
  idleCloseMs?: number;
  maxRooms?: number;
  maxParticipants?: number;
  /** Test seam: room ids (default: 16 random base64url characters). */
  newRoomId?: () => string;
}

export type CreateRoomResult = { ok: true; room: CollabRoom } | { ok: false; code: 'limit' };
export type JoinRoomResult = { ok: true; handle: CollabDocHandle } | { ok: false; code: 'not-found' | 'limit' };

/**
 * Markdown Workspace rooms on the Hub (PD-104): plain in-memory Y.Docs, never stored, never materialized. A room has no owner
 * record; the REST layer decides who may create one. "Keep on Hub" reads the text with `text()` and persists it elsewhere.
 */
export interface CollabRooms {
  list(): CollabRoom[];
  create(name: string): CreateRoomResult;
  /** A participant handle on the room's document, shaped like a registry handle so the socket layer treats both alike. */
  join(roomId: string): JoinRoomResult;
  /** The room's current Markdown text, or undefined for an unknown room. */
  text(roomId: string): string | undefined;
  has(roomId: string): boolean;
  /** Ends every handle with `shutdown` and drops every room (shutdown and manual transfer). */
  closeAll(): void;
  /** `closeAll` and stops the timers for good. */
  dispose(): void;
}

interface RoomHandle extends CollabDocHandle {
  readonly updateListeners: Set<(update: Uint8Array, origin: unknown) => void>;
  readonly closedListeners: Set<(reason: CollabCloseReason) => void>;
  released: boolean;
  closed: boolean;
}

interface RoomEntry {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly doc: Y.Doc;
  readonly handles: Set<RoomHandle>;
  bytes: number | null;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

export function createCollabRooms(options: CollabRoomsOptions): CollabRooms {
  const idleCloseMs = options.idleCloseMs ?? COLLAB_ROOM_IDLE_CLOSE_MS;
  const maxRooms = options.maxRooms ?? COLLAB_MAX_ROOMS;
  const maxParticipants = options.maxParticipants ?? COLLAB_MAX_ROOM_PARTICIPANTS;
  const newRoomId = options.newRoomId ?? ((): string => randomBytes(12).toString('base64url'));
  const rooms = new Map<string, RoomEntry>();
  let disposed = false;

  const armIdle = (entry: RoomEntry): void => {
    if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (entry.handles.size === 0) dropRoom(entry, 'evicted');
    }, idleCloseMs);
    entry.idleTimer.unref?.();
  };

  function dropRoom(entry: RoomEntry, reason: CollabCloseReason): void {
    if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
    if (rooms.get(entry.id) === entry) rooms.delete(entry.id);
    for (const handle of [...entry.handles]) {
      handle.closed = true;
      handle.updateListeners.clear();
      const listeners = [...handle.closedListeners];
      handle.closedListeners.clear();
      for (const listener of listeners) {
        try { listener(reason); } catch { /* a participant's failure never blocks the others */ }
      }
    }
    entry.handles.clear();
    entry.doc.destroy();
  }

  const bytesOf = (entry: RoomEntry): number => {
    entry.bytes ??= contentBytes(entry.doc, 'room');
    return entry.bytes;
  };

  function exceedsCap(entry: RoomEntry, update: Uint8Array): boolean {
    const current = bytesOf(entry);
    if (current + update.byteLength * MAX_JSON_GROWTH_PER_UPDATE_BYTE <= SYNC_LIMITS.maxRecordBytes) return false;
    const clone = new Y.Doc();
    try {
      Y.applyUpdate(clone, Y.encodeStateAsUpdate(entry.doc));
      Y.applyUpdate(clone, update);
      const grown = contentBytes(clone, 'room');
      return grown > SYNC_LIMITS.maxRecordBytes && grown > current;
    } finally {
      clone.destroy();
    }
  }

  function makeHandle(entry: RoomEntry): RoomHandle {
    const handle: RoomHandle = {
      docKey: `room:${entry.id}`,
      doc: entry.doc,
      updateListeners: new Set(),
      closedListeners: new Set(),
      released: false,
      closed: false,
      apply(update: Uint8Array, _editor: CollabPrincipal): CollabApplyResult {
        if (handle.closed || handle.released || rooms.get(entry.id) !== entry) return { ok: false, code: 'closed' };
        if (exceedsCap(entry, update)) return { ok: false, code: 'too-large' };
        Y.applyUpdate(entry.doc, update, handle);
        return { ok: true };
      },
      onUpdate(listener) {
        handle.updateListeners.add(listener);
        return () => void handle.updateListeners.delete(listener);
      },
      onClosed(listener) {
        handle.closedListeners.add(listener);
        return () => void handle.closedListeners.delete(listener);
      },
      release() {
        if (handle.released) return;
        handle.released = true;
        handle.updateListeners.clear();
        entry.handles.delete(handle);
        if (!handle.closed && rooms.get(entry.id) === entry && entry.handles.size === 0) armIdle(entry);
      },
    };
    return handle;
  }

  const summarize = (entry: RoomEntry): CollabRoom => ({ id: entry.id, name: entry.name, participants: entry.handles.size, createdAt: entry.createdAt });

  const closeAll = (): void => {
    for (const entry of [...rooms.values()]) dropRoom(entry, 'shutdown');
  };

  return {
    list: () => [...rooms.values()].map(summarize),

    create(name) {
      if (disposed || rooms.size >= maxRooms) return { ok: false, code: 'limit' };
      let id = newRoomId();
      while (rooms.has(id)) id = newRoomId();
      const doc = new Y.Doc();
      const entry: RoomEntry = { id, name, createdAt: new Date(options.now()).toISOString(), doc, handles: new Set(), bytes: null, idleTimer: undefined };
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        entry.bytes = null;
        for (const handle of entry.handles) for (const listener of handle.updateListeners) listener(update, origin);
      });
      rooms.set(id, entry);
      armIdle(entry);
      return { ok: true, room: summarize(entry) };
    },

    join(roomId) {
      const entry = rooms.get(roomId);
      if (!entry) return { ok: false, code: 'not-found' };
      if (entry.handles.size >= maxParticipants) return { ok: false, code: 'limit' };
      if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
      const handle = makeHandle(entry);
      entry.handles.add(handle);
      return { ok: true, handle };
    },

    text: (roomId) => rooms.get(roomId)?.doc.getText(MARKDOWN_TEXT).toString(),
    has: (roomId) => rooms.has(roomId),
    closeAll,

    dispose() {
      disposed = true;
      closeAll();
    },
  };
}
