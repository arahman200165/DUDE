import type { FastifyInstance } from 'fastify';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { getAuthorityState } from '../hub/authority.js';
import { envelope } from '../server/errors.js';

export const HUB_TRANSFERRED_MESSAGE = 'This Hub was transferred to another machine and is read-only.';
const HELLO_PATH = `${HUB_API_PREFIX}/hello`;

/** Collapses what a router could still resolve to an API path: percent-encoding, repeated slashes, backslashes. */
function normalizedPath(url: string): string {
  const raw = url.split('?')[0] ?? '/';
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* an undecodable path is treated as written */ }
  return decoded.replace(/[\\/]+/g, '/');
}

/** True when the request targets (or could be routed to) the API; only `GET|HEAD /api/v1/hello` is exempt from the fence. */
export function isFencedWhenTransferred(method: string, url: string): boolean {
  const pathname = normalizedPath(url);
  if (!/^\/api(?:\/|$)/i.test(pathname)) return false;
  return !((method === 'GET' || method === 'HEAD') && pathname === HELLO_PATH);
}

/**
 * Fencing of a transferred Hub (PD-071): once `authority_state` is `transferred`, every API request except `GET /api/v1/hello`
 * (which reports the state) answers 503 `hub-transferred`, so no sign-in, pairing, sync, web, session or realtime request can
 * succeed and nothing can be written. Static and SPA paths still load so the web app can show a banner.
 *
 * Register FIRST among the request hooks: it must run before the IP block, the rate limiter and every authentication
 * step, so a stale session or device token never reaches a route, and the refusal is neither metered as a flood hit nor audited.
 * The state is read from `meta` per request (one indexed lookup), so a reactivation takes effect on the next request.
 */
export function registerTransferFence(app: FastifyInstance, db: Db): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!isFencedWhenTransferred(request.method, request.url)) return undefined;
    if (getAuthorityState(db) !== 'transferred') return undefined;
    // A refused WebSocket upgrade never reaches the websocket plugin's own onRequest/onResponse hooks (this one answers first),
    // so nothing would end the upgraded connection: close it once the 503 is written.
    if (typeof request.headers.upgrade === 'string') {
      void reply.header('Connection', 'close');
      reply.raw.once('finish', () => request.raw.socket.destroy());
    }
    return reply.code(503).type('application/json').header('Cache-Control', 'no-store').send(envelope('hub-transferred', HUB_TRANSFERRED_MESSAGE));
  });
}
