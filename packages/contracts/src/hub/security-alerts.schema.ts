import Type, { type Static } from 'typebox';

/** One security-relevant audit row, summarised by the Hub (no secrets). */
export const SecurityAlert = Type.Object({
  seq: Type.Integer(),
  at: Type.String(),
  event: Type.String(),
  outcome: Type.String(),
  ip: Type.Union([Type.String(), Type.Null()]),
  summary: Type.String(),
});
export type SecurityAlert = Static<typeof SecurityAlert>;

export const SecurityAlertsResponse = Type.Object({
  alerts: Type.Array(SecurityAlert),
  unseen: Type.Integer({ minimum: 0 }),
  seenSeq: Type.Integer({ minimum: 0 }),
});
export type SecurityAlertsResponse = Static<typeof SecurityAlertsResponse>;

export const MarkAlertsSeenRequest = Type.Object({ upToSeq: Type.Integer({ minimum: 0 }) }, { additionalProperties: false });
export type MarkAlertsSeenRequest = Static<typeof MarkAlertsSeenRequest>;
