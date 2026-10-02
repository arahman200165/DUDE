import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

/**
 * The Yjs sync/awareness room logic shared between `apps/desktop/collab-server.ts`
 * (Phase 8 Stage 6, one always-present room per desktop session) and
 * `apps/collab-relay/` (Stage 7, a standalone self-hosted relay that can host many
 * rooms at once). Node-only (depends on the `ws` WebSocket type), so it
 * lives outside `apps/web/src/shared-logic/` (that directory is for logic shared
 * between the browser renderer and `apps/desktop/` — this is shared between
 * two Node processes instead) and outside both `apps/web/src/app/` and `apps/desktop/`
 * themselves, since neither owns it.
 *
 * Deliberately has no opinion on room registries, session codes, or HTTP —
 * each consumer owns that: `collab-server.ts` checks its one fixed code
 * before ever calling `handleConnection`; `apps/collab-relay/server.ts` looks up/creates
 * a room by an id parsed from the URL path and checks that room's code the
 * same way.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface CollabRoom {
  readonly doc: Y.Doc;
  handleConnection(conn: WebSocket): void;
  participantCount(): number;
  destroy(): void;
}

function send(conn: WebSocket, encoder: encoding.Encoder): void {
  if (conn.readyState !== 1 /* WebSocket.OPEN */) return;
  try {
    conn.send(encoding.toUint8Array(encoder));
  } catch {
    conn.close();
  }
}

export function createCollabRoom(): CollabRoom {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const clients = new Set<WebSocket>();
  const connControlledIds = new Map<WebSocket, Set<number>>();

  function broadcast(encoder: encoding.Encoder): void {
    const message = encoding.toUint8Array(encoder);
    for (const client of clients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) client.send(message);
    }
  }

  doc.on('update', (update: Uint8Array) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(encoder);
  });

  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: WebSocket | null) => {
    const changedIds = added.concat(updated, removed);
    const controlled = origin ? connControlledIds.get(origin) : undefined;
    if (controlled) {
      for (const id of added.concat(updated)) controlled.add(id);
      for (const id of removed) controlled.delete(id);
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedIds));
    broadcast(encoder);
  });

  return {
    doc,

    handleConnection(conn) {
      clients.add(conn);
      connControlledIds.set(conn, new Set());

      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(syncEncoder, doc);
      send(conn, syncEncoder);

      const states = awareness.getStates();
      if (states.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, [...states.keys()]));
        send(conn, awarenessEncoder);
      }

      conn.on('message', (data: ArrayBuffer) => {
        const decoder = decoding.createDecoder(new Uint8Array(data));
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MESSAGE_SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
          if (encoding.length(encoder) > 1) send(conn, encoder);
        } else if (messageType === MESSAGE_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn);
        }
      });

      conn.on('close', () => {
        clients.delete(conn);
        const controlled = connControlledIds.get(conn);
        connControlledIds.delete(conn);
        if (controlled && controlled.size > 0) {
          awarenessProtocol.removeAwarenessStates(awareness, [...controlled], null);
        }
      });
    },

    participantCount: () => clients.size,

    destroy() {
      awareness.destroy();
      doc.destroy();
    },
  };
}
