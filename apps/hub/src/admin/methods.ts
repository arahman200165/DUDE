import type { Db } from '@dude/sqlite-store';
import type { HubBindMode } from '../config/hub-config.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import { ensureSetupToken } from '../auth/setup-token.js';

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
}

/** The method registry served over the admin channel. Later milestones add entries here. */
export function buildAdminMethods(context: AdminMethodContext): Record<string, AdminMethod> {
  const now = context.now ?? Date.now;
  return {
    /** Delivers the one-time setup token to an elevated local admin; refused once an owner exists. */
    'setup.token': () => {
      const token = ensureSetupToken(context.db, context.configDir, now());
      if (token === null) throw new AdminError('already-bootstrapped', 'This Hub already has an owner.');
      return { token, spkiSha256: context.spkiSha256, port: context.getPort(), hubInstanceId: context.hubInstanceId };
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
