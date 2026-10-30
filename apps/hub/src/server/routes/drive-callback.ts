import type { FastifyInstance } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import type { DriveAuthorizations } from '../../hub/drive-authorization.js';
import { registerOAuthCallbackRoute } from './oauth-callback.js';

/**
 * The Google Drive backup destination's one HTTP route (32-SS1, Milestone 856, PD-154): `GET /backup/drive/callback`, the browser
 * redirect back from Google's consent screen. Every rule (credential type none, session-less, the cross-site exemption only while a
 * connect waits, one in-memory authorization, a static page, the throttle and the audit) is documented in `oauth-callback.ts`.
 */
export interface DriveCallbackRouteOptions {
  db: Db;
  now: () => number;
  drive: DriveAuthorizations;
}

export function registerDriveCallbackRoute(app: FastifyInstance, options: DriveCallbackRouteOptions): void {
  registerOAuthCallbackRoute(app, {
    db: options.db, now: options.now, authorizations: options.drive, path: HUB_BACKUP_DRIVE_PATHS.callback, auditEvent: 'backup.drive-authorized', providerName: 'Google Drive',
  });
}
