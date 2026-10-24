import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { REALTIME_MAX_MESSAGE_BYTES } from '@dude/contracts/hub';

/**
 * Transport-level frame ceiling shared by every Hub WebSocket route. Each route enforces its own (smaller or equal)
 * message cap in its handler and closes with 4010 above it.
 */
export const HUB_WS_MAX_PAYLOAD_BYTES = REALTIME_MAX_MESSAGE_BYTES * 4;

/**
 * Registers `@fastify/websocket` once for the whole Hub (PD-100). The plugin attaches to the server's single `upgrade`
 * listener, so a second registration (one per route) would route every upgrade twice; realtime and collab routes are
 * declared in their own scopes after this.
 */
export function registerWsHost(app: FastifyInstance, maxPayload: number = HUB_WS_MAX_PAYLOAD_BYTES): void {
  app.register(websocket, { options: { maxPayload } });
}
