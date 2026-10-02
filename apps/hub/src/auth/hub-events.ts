import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import type { RevokedSession } from './sessions.js';

export interface SessionRevokedEvent extends RevokedSession {
  reason: 'revoked' | 'device-revoked' | 'device-unenrolled' | 'revoke-all' | 'sign-out' | 'password-changed' | 'recovery' | 'owner-reset';
}

export interface HubEventMap {
  'session-revoked': [SessionRevokedEvent];
  /** The realtime milestone closes the sockets of this device. */
  'device-revoked': [{ deviceId: string }];
  'device-unenrolled': [{ deviceId: string }];
  'device-registry-changed': [{ deviceId: string; change: 'enrolled' | 'renamed' | 'revoked' | 'unenrolled' | 'recovery-trust' | 'updated' }];
}

/** Internal in-process events (consumed by the realtime milestone). Never carries credentials. */
export class HubEvents extends EventEmitter<HubEventMap> {}

declare module 'fastify' {
  interface FastifyInstance { hubEvents: HubEvents }
}

export function emitRevoked(app: Pick<FastifyInstance, 'hubEvents'>, sessions: readonly RevokedSession[], reason: SessionRevokedEvent['reason']): void {
  for (const session of sessions) app.hubEvents.emit('session-revoked', { ...session, reason });
}
