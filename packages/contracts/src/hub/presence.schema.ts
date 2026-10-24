import Type, { type Static } from 'typebox';
import { PRESENCE_DESTINATIONS, type PresenceDestination } from './presence-activity.js';

export { PRESENCE_DESTINATIONS, type PresenceDestination };

/** Owner read of who is online right now (PD-108). Credential: owner cookie or bearer session. */
export const HUB_PRESENCE_PATH = '/api/v1/presence';

/**
 * What a device is showing, shared only when that device opted in (`__device__:presenceShareActivity`). Held in Hub
 * memory only and never audited.
 */
export const PresenceActivity = Type.Union([
  Type.Object({ kind: Type.Literal('tool'), id: Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,63}$' }) }, { additionalProperties: false }),
  Type.Object({
    kind: Type.Literal('destination'),
    id: Type.Unsafe<PresenceDestination>({ type: 'string', enum: [...PRESENCE_DESTINATIONS] }),
  }, { additionalProperties: false }),
]);
export type PresenceActivity = Static<typeof PresenceActivity>;

/** One registry row's live state: desktops and phones by their device socket, browsers by their owner cookie socket. */
export const PresenceEntry = Type.Object({
  deviceId: Type.String(),
  online: Type.Boolean(),
  activity: Type.Union([PresenceActivity, Type.Null()]),
});
export type PresenceEntry = Static<typeof PresenceEntry>;

export const PresenceResponse = Type.Object({ entries: Type.Array(PresenceEntry) });
export type PresenceResponse = Static<typeof PresenceResponse>;
