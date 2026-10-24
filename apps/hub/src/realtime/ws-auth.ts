import type { FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { resolveOwner } from '../auth/owner-auth.js';
import { OWNER_BEARER_PREFIX } from '../auth/sessions.js';
import { DEVICE_TOKEN_PREFIX, resolveDeviceToken } from '../devices/device-tokens.js';
import { noteRevokedToken } from '../devices/revoked-attempts.js';
import { classifyCredential } from '../security/request-guard.js';
import type { HostGuard } from '../security/host-guard.js';

export type WsPrincipalKind = 'owner-cookie' | 'owner-bearer' | 'device';

/** The authenticated identity behind a Hub WebSocket (realtime and collab, PD-034/PD-100). */
export interface WsPrincipal {
  kind: WsPrincipalKind;
  deviceId: string | null;
  /** Owner-bearer sessions may be bound to a device. */
  boundDeviceId: string | null;
  sessionHash: string | null;
  /** Non-sliding liveness check. */
  stillValid(now: number): boolean;
}

export interface WsAuthOptions {
  db: Db;
  now: () => number;
  hostGuard: HostGuard;
}

/**
 * A session is live while unrevoked and unexpired. A rotated session (`rotated_to`) is live while its successor is live
 * (followed up to 5 hops), so an open socket survives a rotation but ends when the successor is revoked or expires.
 */
export const sessionLive = (db: Db, sessionHash: string, now: number): boolean => {
  const at = new Date(now).toISOString();
  const query = db.prepare('SELECT revoked_at, idle_expires_at, absolute_expires_at, rotated_to FROM sessions WHERE session_hash = ?');
  let hash: string | null = sessionHash;
  for (let hop = 0; hop <= 5 && hash !== null; hop += 1) {
    const row = query.get(hash) as { revoked_at: string | null; idle_expires_at: string; absolute_expires_at: string; rotated_to: string | null } | undefined;
    if (row === undefined || row.revoked_at !== null) return false;
    if (row.rotated_to === null) return row.idle_expires_at > at && row.absolute_expires_at > at;
    hash = row.rotated_to;
  }
  return false;
};

/**
 * Credential types: owner cookie session (Origin must match the allowed Host), owner bearer, device token. The
 * credential is checked before the HTTP upgrade; anything else is a plain 401 and never becomes a WebSocket.
 * `via` names the socket in the revoked-token attempt record.
 */
export function authenticateUpgrade(request: FastifyRequest, options: WsAuthOptions, via: 'realtime' | 'collab'): WsPrincipal | null {
  const credential = classifyCredential(request);
  if (credential.conflict || credential.duplicateSession) return null;
  const { db, now } = options;
  if (credential.kind === 'cookie') {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || !options.hostGuard.isRequestAllowed(request) || !options.hostGuard.originMatches(request, origin)) return null;
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') return null;
    const result = resolveOwner(request, { db, now, kinds: ['cookie'] });
    if (!result.ok) return null;
    const hash = result.owner.sessionHash;
    return { kind: 'owner-cookie', deviceId: null, boundDeviceId: null, sessionHash: hash, stillValid: (at) => sessionLive(db, hash, at) };
  }
  const token = credential.bearerToken;
  if (credential.kind !== 'bearer' || token === undefined) return null;
  if (token.startsWith(DEVICE_TOKEN_PREFIX)) {
    const device = resolveDeviceToken(db, token, now());
    if (!device) {
      noteRevokedToken(db, token, via, request.ip || undefined, now());
      return null;
    }
    return { kind: 'device', deviceId: device.deviceId, boundDeviceId: null, sessionHash: null, stillValid: (at) => resolveDeviceToken(db, token, at) !== null };
  }
  if (token.startsWith(OWNER_BEARER_PREFIX)) {
    const result = resolveOwner(request, { db, now, kinds: ['bearer'] });
    if (!result.ok) return null;
    const hash = result.owner.sessionHash;
    return { kind: 'owner-bearer', deviceId: null, boundDeviceId: result.owner.deviceId, sessionHash: hash, stillValid: (at) => sessionLive(db, hash, at) };
  }
  return null;
}
