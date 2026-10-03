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
import { HUB_MIGRATIONS } from '../db/migrations/index.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyHubNameChange, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { computeSubjectAltNames, missingSubjectAltNames } from '../tls/names.js';
import type { TlsRotation } from '../tls/rotation.js';

export interface AdminMethodContext {
  db: Db;
  hubVersion: string;
  hubInstanceId: string;
  bind: HubBindMode;
  getPort: () => number;
  startedAt: number;
  configDir: string;
  /** `config/hub.json`; enables `network.set`. */
  configFile?: string;
  spkiSha256: string;
  /** The TLS directory; lets `tls.names.set` compare the active certificate with the wanted names. */
  tlsDir?: string;
  /** Called with the new operator names after `tls.names.set`, so the running Host guard picks them up without a restart. */
  onNamesChanged?: (names: readonly string[]) => void;
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
  /** The SAN set the on-disk config calls for (names plus bind mode; the config may be ahead of the running bind). */
  const desiredSans = (): string[] | undefined => (context.configFile ? computeSubjectAltNames(loadOrCreateHubConfig(context.configFile)) : undefined);
  const activeCertMissing = (wanted: readonly string[]): string[] => {
    const certFile = context.tlsDir ? path.join(context.tlsDir, 'cert.pem') : null;
    return certFile !== null && existsSync(certFile) ? missingSubjectAltNames(readFileSync(certFile, 'utf8'), wanted) : [];
  };
  const flag = (params: unknown, name: string): boolean => (params as Record<string, unknown> | null)?.[name] === true;
  return {
    'tls.status': () => rotation().status(),
    'tls.stage': (params) => rotate(() => rotation().stage({ restage: flag(params, 'restage'), ...(desiredSans() ? { extraNames: desiredSans() as string[] } : {}) })),
    /**
     * Adds or removes one operator name in `hub.json` and stages a re-issued certificate carrying the new SAN set through
     * the dual-pin rotation (devices pin the certificate, so it is never replaced silently). The Host guard is updated in memory.
     */
    'tls.names.set': (params) => {
      const input = (params ?? {}) as { add?: unknown; remove?: unknown };
      if ((typeof input.add === 'string') === (typeof input.remove === 'string')) throw new AdminError('bad-request', 'Provide exactly one of add or remove.');
      if (!context.configFile) throw new AdminError('unavailable', 'Names cannot be changed in this context.');
      const config = loadOrCreateHubConfig(context.configFile);
      const previous = config.exposure.names;
      let names: string[];
      try { names = applyHubNameChange(config.exposure, typeof input.add === 'string' ? { add: input.add } : { remove: input.remove as string }); } catch (error) { throw new AdminError('bad-request', (error as Error).message); }
      const changed = names !== previous;
      const next = { ...config, exposure: { ...config.exposure, names } };
      const sans = computeSubjectAltNames(next);
      // Re-staging when nothing changed lets `add` of an already-configured name fix a stale certificate.
      const mustStage = changed || activeCertMissing(sans).length > 0;
      if (mustStage && rotation().status().next) throw new AdminError('conflict', 'A next certificate is already staged. Run "dude-hub tls activate" before changing names.');
      if (changed) writeHubConfig(context.configFile, next);
      let staged: { spkiSha256: string; restaged: boolean } | null = null;
      try {
        if (mustStage) staged = rotate(() => rotation().stage({ extraNames: sans }));
      } catch (error) {
        if (changed) writeHubConfig(context.configFile, config);
        throw error;
      }
      if (changed) {
        audit(context.db, { event: 'tls.names-changed', outcome: 'success', actorKind: 'cli', detail: { names }, now: now() });
        context.onNamesChanged?.(names);
      }
      return { names, subjectAltNames: sans, staged, changed };
    },
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
    /** Persists the bind mode in the service-owned config (applies after the next start) and audits the change. */
    'network.set': (params) => {
      const bind = (params as { bind?: unknown } | null)?.bind;
      if (bind !== 'lan' && bind !== 'loopback') throw new AdminError('bad-request', 'bind must be "lan" or "loopback".');
      if (context.bind === 'container') throw new AdminError('unsupported', 'Container mode always binds all interfaces; the network mode cannot be changed.');
      if (!context.configFile) throw new AdminError('unavailable', 'Network mode cannot be changed in this context.');
      const config = loadOrCreateHubConfig(context.configFile);
      const previous = config.bind;
      if (previous !== bind) {
        writeHubConfig(context.configFile, { ...config, bind });
        audit(context.db, { event: 'network.mode-changed', outcome: 'success', actorKind: 'cli', detail: { from: previous, to: bind }, now: now() });
      }
      return { bind, previous, running: context.bind, port: context.getPort(), restartRequired: context.bind !== bind };
    },
    /** Redacted diagnostics for `status`, `doctor` and the service commands; never secrets. */
    status: () => {
      const applied = context.db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string; applied_at: string }>;
      const meta = (key: string): number => {
        const row = context.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
        return row ? Number(row.value) || 0 : 0;
      };
      const appliedVersions = new Set(applied.map((m) => Number(m.version)));
      return {
        hubVersion: context.hubVersion,
        hubInstanceId: context.hubInstanceId,
        bootstrapped: context.db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get() !== undefined,
        bind: context.bind,
        lanMode: context.bind === 'lan',
        port: context.getPort(),
        pid: process.pid,
        uptimeSeconds: Math.max(0, Math.floor((now() - context.startedAt) / 1000)),
        spkiSha256: context.spkiSha256,
        deviceCount: scope().devices,
        schemaVersion: meta('schema_version'),
        minReaderVersion: meta('min_reader_version'),
        migrations: applied.map((m) => ({ version: Number(m.version), name: m.name, appliedAt: m.applied_at })),
        pendingMigrations: HUB_MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).map((m) => m.version),
      };
    },
  };
}
