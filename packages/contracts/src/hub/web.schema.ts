import Type, { type Static } from 'typebox';
import { SyncCategoryFlags, SyncCategorySchema } from './sync.schema.js';

/**
 * Hub web record routes (Phase 31E, PD-050/PD-051). Credential: owner cookie session plus CSRF only; a bearer, a device
 * token or no credential never reaches them. The request and response shapes of push, changes, snapshot and state are the
 * device sync shapes from `sync.schema.ts`.
 */
export const WEB_PATHS = {
  attach: '/web/attach',
  snapshot: '/web/snapshot',
  changes: '/web/changes',
  push: '/web/push',
  state: '/web/state',
  access: '/web/access',
} as const;

/** `not-attached` envelope code: the session has no browser row yet (call `POST /web/attach`). */
export const WEB_NOT_ATTACHED = 'not-attached';

export const WebAttachRequest = Type.Object(
  {
    installationId: Type.String({ pattern: '^[A-Za-z0-9-]{8,64}$' }),
    label: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { additionalProperties: false },
);
export type WebAttachRequest = Static<typeof WebAttachRequest>;

export const WebAttachResponse = Type.Object({
  deviceId: Type.String({ minLength: 1, maxLength: 64 }),
  label: Type.String(),
  access: SyncCategoryFlags,
  headRevision: Type.Integer({ minimum: 0 }),
  floor: Type.Integer({ minimum: 0 }),
  retentionDays: Type.Integer({ minimum: 1 }),
});
export type WebAttachResponse = Static<typeof WebAttachResponse>;

export const WebAccessResponse = Type.Object({ access: SyncCategoryFlags });
export type WebAccessResponse = Static<typeof WebAccessResponse>;

export const WebAccessSetRequest = Type.Object({ category: SyncCategorySchema, enabled: Type.Boolean() }, { additionalProperties: false });
export type WebAccessSetRequest = Static<typeof WebAccessSetRequest>;
