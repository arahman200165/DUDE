import { createServer, type Server as HttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createCollabRoom } from "@dude/collab-protocol/room";

/**
 * A local, same-machine/LAN real-time collaboration server for Advanced
 * Markdown Workspace (Phase 8 Stage 6). The actual Yjs sync/awareness
 * protocol handling lives in `packages/collab-protocol/src/room.ts`, shared with Stage 7's
 * standalone relay — this file only owns the one-room-per-session HTTP/WS
 * server, the session code, and the LAN address to advertise.
 *
 * Security carve-out from every other Phase 8 backend: LAN reachability is
 * the whole point of this stage, so this binds `0.0.0.0`, not `127.0.0.1`
 * — a deliberate, narrow exception to the "loopback only" rule (see
 * `apps/desktop/AGENTS.md`). A random per-session code, required as a `?code=`
 * query param before a connection is accepted, is the mitigation: only
 * someone given the code out-of-band (the session's own sharing UI) can
 * join, not anyone who happens to be on the same LAN.
 */

export interface CollabSession {
  readonly port: number;
  readonly sessionCode: string;
  readonly lanAddress: string;
  readonly participantCount: () => number;
  stop(): void;
}

function pickLanAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

export function startCollabServer(): Promise<CollabSession> {
  const room = createCollabRoom();
  const sessionCode = randomBytes(6).toString('hex');

  const httpServer: HttpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (conn, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.searchParams.get('code') !== sessionCode) {
      conn.close(4001, 'Invalid session code');
      return;
    }
    room.handleConnection(conn);
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '0.0.0.0', () => {
      const address = httpServer.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Collab server did not bind to a TCP port'));
        return;
      }
      resolve({
        port: address.port,
        sessionCode,
        lanAddress: pickLanAddress(),
        participantCount: () => room.participantCount(),
        stop: () => {
          room.destroy();
          wss.close();
          httpServer.close();
        },
      });
    });
  });
}
