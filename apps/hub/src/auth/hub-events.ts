import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import type { HubNotificationKind, HubNotificationSeverity } from '@dude/contracts/hub';
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
  'tls-next-pin': [{ spkiSha256: string; /** `proxy` for a staged reverse-proxy leaf pin (acknowledged without a certificate fetch). */ kind?: 'proxy' }];
  /** Device-assisted owner recovery completed (PD-029); broadcast to the remaining owner/device connections. */
  'owner-recovered': [{ deviceId: string; at: string }];
  /** Canonical records changed (sync push or environment clear); device sockets get `changes-available`. */
  'records-changed': [{ environmentId: string; revision: number; originDeviceId: string | null }];
  /** The environment clear deleted every record (PD-101): the collaboration registry drops all collaborative state. */
  'environment-cleared': [{ environmentId: string }];
  /** A web access toggle changed (PD-051); owner cookie sockets get `web-access-changed` so open browsers re-fetch. */
  'web-access-changed': [{ environmentId: string }];
  /** A device reported its sync state (`PUT /sync/state`); collaboration re-checks the consent of that device's subscriptions (PD-103). */
  'device-sync-state-changed': [{ deviceId: string }];
  /** A Hub notification was stored (PD-109); owner sockets and sockets of devices holding the reader grant get `notification`. */
  'notification-created': [{ id: string; kind: HubNotificationKind; severity: HubNotificationSeverity; title: string }];
}

/** Internal in-process events (consumed by the realtime milestone). Never carries credentials. */
export class HubEvents extends EventEmitter<HubEventMap> {}

declare module 'fastify' {
  interface FastifyInstance { hubEvents: HubEvents; hostGuard: HostGuard }
}

export function emitRevoked(app: Pick<FastifyInstance, 'hubEvents'>, sessions: readonly RevokedSession[], reason: SessionRevokedEvent['reason']): void {
  for (const session of sessions) app.hubEvents.emit('session-revoked', { ...session, reason });
}
