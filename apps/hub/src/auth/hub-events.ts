import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import type { RevokedSession } from './sessions.js';
import type { HostGuard } from '../security/host-guard.js';

export interface SessionRevokedEvent extends RevokedSession {
  reason: 'revoked' | 'device-revoked' | 'device-unenrolled' | 'revoke-all' | 'sign-out' | 'password-changed' | 'recovery' | 'owner-reset' | 'device-recovery';
}

export interface HubEventMap {
  'session-revoked': [SessionRevokedEvent];
  /** The realtime socket layer closes the sockets of this device. */
  'device-revoked': [{ deviceId: string }];
  'device-unenrolled': [{ deviceId: string }];
  'device-registry-changed': [{ deviceId: string; change: 'enrolled' | 'renamed' | 'revoked' | 'unenrolled' | 'recovery-trust' | 'updated' | 'presence' }];
  /** A next TLS pin was staged. */
  'tls-next-pin': [{ spkiSha256: string }];
  /** Device-assisted owner recovery completed (PD-029); broadcast to the remaining owner/device connections. */
  'owner-recovered': [{ deviceId: string; at: string }];
  /** Canonical records changed (sync push or environment clear); device sockets get `changes-available`. */
  'records-changed': [{ environmentId: string; revision: number; originDeviceId: string | null }];
}

/** Internal in-process events (consumed by the realtime milestone). Never carries credentials. */
export class HubEvents extends EventEmitter<HubEventMap> {}

declare module 'fastify' {
  interface FastifyInstance { hubEvents: HubEvents; hostGuard: HostGuard }
}

export function emitRevoked(app: Pick<FastifyInstance, 'hubEvents'>, sessions: readonly RevokedSession[], reason: SessionRevokedEvent['reason']): void {
  for (const session of sessions) app.hubEvents.emit('session-revoked', { ...session, reason });
}
