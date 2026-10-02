import { createServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createCollabRoom, type CollabRoom } from "@dude/collab-protocol/room";

/**
 * The standalone BYO relay server (Phase 8 Stage 7) — self-hosted by a
 * user, not run by DUDE itself (see DUDE_PRD.md §5.2's amended non-goals
 * note: DUDE never operates shared infrastructure). Extends Stage 6's
 * same-machine/LAN collab session across networks: a desktop app points at
 * a relay URL instead of (or in addition to) its own local server.
 *
 * Untrusted-by-default from the app's perspective (see
 * `MarkdownCollabClient`'s doc comment and DUDE_PRD.md §31's amendment):
 * every message this relay forwards is treated purely as Yjs CRDT sync/
 * awareness data by the clients that receive it, never as anything that
 * triggers app-side privileged behavior.
 *
 * Multi-room: a room is identified by the WebSocket URL's path (e.g.
 * `wss://relay.example.com/<roomId>?code=<code>`); the first connection to
 * a given room id establishes that room's code from its own `?code=` query
 * param (client-generated, same as `apps/desktop/collab-server.ts`'s locally-
 * generated code — the relay itself never issues codes), and every
 * subsequent connection to that room id must match it. A room is torn down
 * once its last participant disconnects, so a long-running relay doesn't
 * accumulate abandoned documents.
 *
 * Ships as `ws://`/unencrypted by default, matching Stage 6's local server
 * — a self-hoster exposing this beyond their own LAN is responsible for
 * TLS termination (e.g. behind a reverse proxy), not something this file
 * attempts itself.
 */

interface RegisteredRoom {
  readonly room: CollabRoom;
  readonly code: string;
}

export interface RelayServer {
  readonly httpServer: HttpServer;
  roomCount(): number;
}

export function createRelayServer(): RelayServer {
  const rooms = new Map<string, RegisteredRoom>();

  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('DUDE collab relay is running.\n');
  });
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (conn, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const roomId = url.pathname.replace(/^\//, '');
    const code = url.searchParams.get('code');

    if (!roomId || !code) {
      conn.close(4000, 'A room id (URL path) and ?code= are required.');
      return;
    }

    let entry = rooms.get(roomId);
    if (!entry) {
      entry = { room: createCollabRoom(), code };
      rooms.set(roomId, entry);
    } else if (entry.code !== code) {
      conn.close(4001, 'Invalid session code');
      return;
    }

    entry.room.handleConnection(conn);

    const registeredRoom = entry;
    conn.on('close', () => {
      queueMicrotask(() => {
        if (registeredRoom.room.participantCount() === 0 && rooms.get(roomId) === registeredRoom) {
          registeredRoom.room.destroy();
          rooms.delete(roomId);
        }
      });
    });
  });

  return {
    httpServer,
    roomCount: () => rooms.size,
  };
}
