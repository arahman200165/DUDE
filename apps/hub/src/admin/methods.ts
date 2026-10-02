import type { Db } from '@dude/sqlite-store';
import type { HubBindMode } from '../config/hub-config.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import { createHash } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import { ensureSetupToken, createResetToken, pendingResetToken } from '../auth/setup-token.js';
import { getOwner } from '../auth/owner.js';
import { revokeAllSessions } from '../auth/sessions.js';
import type { RevokedSession } from '../auth/sessions.js';
import { audit } from '../security/audit.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { RotationError } from '../tls/rotation.js';
import type { TlsRotation } from '../tls/rotation.js';

export interface AdminMethodContext {
  db: Db;
  hubVersion: string;
  hubInstanceId: string;
  bind: HubBindMode;
  getPort: () => number;
  startedAt: number;
  configDir: string;
  spkiSha256: string;
  now?: () => number;
  /** Staged confirmations for admin-channel actions (default: a private store). */
  confirmations?: ConfirmationStore;
  /** Called with sessions revoked by an admin action, so the server can emit realtime events. */
  /** Certificate rotation (dual pin). Absent in contexts that cannot swap the listener. */
  tls?: TlsRotation;
  onSessionsRevoked?: (sessions: readonly RevokedSession[]) => void;
}

export const OWNER_RESET_ACTION = 'owner.reset';
const ADMIN_BINDING = 'cli';

/** The method registry served over the admin channel. Later milestones add entries here. */
export function buildAdminMethods(context: AdminMethodContext): Record<string, AdminMethod> {
  const now = context.now ?? Date.now;
  const confirmations = context.confirmations ?? new ConfirmationStore();
  const scope = (): { sessions: number; devices: number } => {
    const at = new Date(now()).toISOString();
    const sessions = context.db
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?')
      .get(at, at) as { n: number };
    const devices = context.db.prepare('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL').get() as { n: number };
    return { sessions: Number(sessions.n), devices: Number(devices.n) };
  };
  const digestOf = (summary: { sessions: number; devices: number }): string => createHash('sha256').update(`${summary.sessions}:${summary.devices}`).digest('hex');
  const rotation = (): TlsRotation => {
    if (!context.tls) throw new AdminError('unavailable', 'Certificate rotation is not available.');
    return context.tls;
  };
  const rotate = <T>(run: () => T): T => {
    try { return run(); } catch (error) {
      if (error instanceof RotationError) throw new AdminError(error.code, error.message);
      throw error;
    }
  };
  const flag = (params: unknown, name: string): boolean => (params as Record<string, unknown> | null)?.[name] === true;
  return {
    'tls.status': () => rotation().status(),
    'tls.stage': (params) => rotate(() => rotation().stage({ restage: flag(params, 'restage') })),
    'tls.activate.preview': (params) => rotate(() => rotation().previewActivate({ force: flag(params, 'force') })),
    'tls.activate.apply': (params) => {
      const confirmToken = (params as { confirmToken?: unknown } | null)?.confirmToken;
      if (typeof confirmToken !== 'string') throw new AdminError('bad-request', 'confirmToken is required.');
      return rotate(() => rotation().applyActivate({ confirmToken, force: flag(params, 'force') }));
    },
    /** Delivers the one-time setup token to an elevated local admin; refused once an owner exists. */
    'setup.token': () => {
      const token = ensureSetupToken(context.db, context.configDir, now());
      if (token !== null) return { token, purpose: 'bootstrap', spkiSha256: context.spkiSha256, port: context.getPort(), hubInstanceId: context.hubInstanceId };
      const reset = pendingResetToken(context.db, context.configDir);
      if (reset === null) throw new AdminError('already-bootstrapped', 'This Hub already has an owner.');
      return { token: reset, purpose: 'owner-reset', spkiSha256: context.spkiSha256, port: context.getPort(), hubInstanceId: context.hubInstanceId };
    },
    /** Step one of the local owner reset: reports the blast radius; nothing changes. */
    'owner.reset.preview': () => {
      if (getOwner(context.db) === null) throw new AdminError('not-bootstrapped', 'This Hub has no owner to reset.');
      const summary = scope();
      const at = now();
      const confirmToken = confirmations.issue({ action: OWNER_RESET_ACTION, digest: digestOf(summary), bindingId: ADMIN_BINDING, now: at });
      return { confirmToken, expiresAt: ConfirmationStore.expiresAt(at), summary };
    },
    /** Step two: revokes every session, deletes the recovery codes and issues a one-time reset token. Devices stay registered. */
    'owner.reset.apply': (params) => {
      const owner = getOwner(context.db);
      if (owner === null) throw new AdminError('not-bootstrapped', 'This Hub has no owner to reset.');
      const confirmToken = (params as { confirmToken?: unknown } | null)?.confirmToken;
      if (typeof confirmToken !== 'string') throw new AdminError('bad-request', 'confirmToken is required.');
      const result = confirmations.consumeDetailed({ token: confirmToken, action: OWNER_RESET_ACTION, digest: digestOf(scope()), bindingId: ADMIN_BINDING, now: now() });
      if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
      if (result === 'digest-mismatch') throw new AdminError('conflict', 'Sessions or devices changed since the preview. Run the preview again.');
      const outcome = transaction(context.db, () => {
        const revoked = revokeAllSessions(context.db, owner.ownerId, undefined, now());
        context.db.prepare('DELETE FROM recovery_codes WHERE owner_id = ?').run(owner.ownerId);
        const token = createResetToken(context.db, context.configDir, now());
        audit(context.db, { event: 'owner.reset-local', outcome: 'success', actorKind: 'cli', detail: { revokedSessions: revoked.length }, now: now() });
        return { revoked, token };
      });
      context.onSessionsRevoked?.(outcome.revoked);
      return { purpose: 'owner-reset', token: outcome.token, spkiSha256: context.spkiSha256, port: context.getPort(), hubInstanceId: context.hubInstanceId, revokedSessions: outcome.revoked.length };
    },
    status: () => ({
      hubVersion: context.hubVersion,
      hubInstanceId: context.hubInstanceId,
      bootstrapped: context.db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get() !== undefined,
      bind: context.bind,
      port: context.getPort(),
      pid: process.pid,
      uptimeSeconds: Math.max(0, Math.floor((now() - context.startedAt) / 1000)),
    }),
  };
}
