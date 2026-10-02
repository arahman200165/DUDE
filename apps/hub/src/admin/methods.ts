import type { Db } from '@dude/sqlite-store';
import type { HubBindMode } from '../config/hub-config.js';
import type { AdminMethod } from './admin-endpoint.js';

export interface AdminMethodContext {
  db: Db;
  hubVersion: string;
  hubInstanceId: string;
  bind: HubBindMode;
  getPort: () => number;
  startedAt: number;
  now?: () => number;
}

/** The method registry served over the admin channel. Later milestones add entries here. */
export function buildAdminMethods(context: AdminMethodContext): Record<string, AdminMethod> {
  const now = context.now ?? Date.now;
  return {
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
