import type { FastifyInstance } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { HUB_BACKUP_ONEDRIVE_PATHS } from '@dude/contracts/hub';
import type { OneDriveAuthorizations } from '../../hub/onedrive-authorization.js';
import { registerOAuthCallbackRoute } from './oauth-callback.js';

/**
 * The OneDrive backup destination's one HTTP route (32-SS1, Milestone 857, PD-150): `GET /backup/onedrive/callback`, the browser
 * redirect back from Microsoft's consent screen. Every rule (credential type none, session-less, the cross-site exemption only while a
 * connect waits, one in-memory authorization, a static page, the throttle and the audit) is documented in `oauth-callback.ts`.
 */
export interface OneDriveCallbackRouteOptions {
  db: Db;
  now: () => number;
  onedrive: OneDriveAuthorizations;
}

export function registerOneDriveCallbackRoute(app: FastifyInstance, options: OneDriveCallbackRouteOptions): void {
  registerOAuthCallbackRoute(app, {
    db: options.db, now: options.now, authorizations: options.onedrive, path: HUB_BACKUP_ONEDRIVE_PATHS.callback, auditEvent: 'backup.onedrive-authorized', providerName: 'OneDrive',
  });
}
