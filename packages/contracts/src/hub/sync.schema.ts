import Type, { type Static } from 'typebox';

/**
 * Synchronization wire contracts (Phase 31D, protocol 2). Payloads are opaque here: the Hub validates them with the
 * entity codecs from `@dude/persistence`. The literals below mirror `@dude/sync` (contracts cannot depend on it; a spec
 * in `@dude/sync` asserts they match).
 */
export const SYNC_WIRE_CATEGORY_IDS = [
  'settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad',
] as const;
export type SyncCategory = (typeof SYNC_WIRE_CATEGORY_IDS)[number];
export const SYNC_WIRE_MAX_PUSH_OPS = 100;
export const SYNC_CURSOR_EXPIRED = 'cursor-expired';

export const SYNC_PATHS = {
  push: '/sync/push',
  changes: '/sync/changes',
  snapshot: '/sync/snapshot',
  state: '/sync/state',
  summary: '/sync/summary',
  clearPreview: '/sync/environment/clear/preview',
  clear: '/sync/environment/clear',
} as const;

const Revision = Type.Integer({ minimum: 0 });
const Count = Type.Integer({ minimum: 0 });
const Iso = Type.String();
const NullableIso = Type.Union([Iso, Type.Null()]);
const EntityType = Type.String({ minLength: 1, maxLength: 64 });
const EntityId = Type.String({ minLength: 1, maxLength: 200 });
const OpId = Type.String({ minLength: 1, maxLength: 64 });
const DeviceId = Type.String({ minLength: 1, maxLength: 64 });
const NullablePayload = Type.Union([Type.Unknown(), Type.Null()]);

export const SyncCategorySchema = Type.Unsafe<SyncCategory>({ type: 'string', enum: [...SYNC_WIRE_CATEGORY_IDS] });
export const SyncCategoryFlags = Type.Object(
  Object.fromEntries(SYNC_WIRE_CATEGORY_IDS.map((id) => [id, Type.Boolean()])) as Record<SyncCategory, ReturnType<typeof Type.Boolean>>,
  { additionalProperties: false },
);
const CategoryCounts = Type.Object(
  Object.fromEntries(SYNC_WIRE_CATEGORY_IDS.map((id) => [id, Count])) as Record<SyncCategory, typeof Count>,
  { additionalProperties: false },
);

export const SyncRecord = Type.Object({
  entityType: EntityType,
  entityId: EntityId,
  revision: Revision,
  deleted: Type.Boolean(),
  payload: NullablePayload,
  schemaVersion: Type.Integer({ minimum: 0 }),
  updatedAt: Iso,
  updatedByDeviceId: Type.Union([DeviceId, Type.Null()]),
});
export type SyncRecord = Static<typeof SyncRecord>;

export const SyncOp = Type.Object({
  opId: OpId,
  entityType: EntityType,
  entityId: EntityId,
  opKind: Type.Union([Type.Literal('upsert'), Type.Literal('delete')]),
  schemaVersion: Type.Integer({ minimum: 0 }),
  basedOnRevision: Type.Union([Revision, Type.Null()]),
  payload: NullablePayload,
});
export type SyncOp = Static<typeof SyncOp>;

export const SYNC_REJECT_REASONS = [
  'unknown-entity', 'non-syncable-scope', 'invalid-payload', 'too-large', 'unknown-setting', 'not-owner-device', 'schema-too-new',
  /** Web pushes only: the environment's web access for the record's category is off. */
  'category-disabled',
] as const;
export type SyncRejectReason = (typeof SYNC_REJECT_REASONS)[number];
export const SyncRejectReasonSchema = Type.Unsafe<SyncRejectReason>({ type: 'string', enum: [...SYNC_REJECT_REASONS] });

export const SyncOpResult = Type.Union([
  Type.Object({ opId: OpId, status: Type.Literal('applied'), revision: Revision }),
  Type.Object({ opId: OpId, status: Type.Literal('duplicate'), revision: Revision }),
  Type.Object({ opId: OpId, status: Type.Literal('conflict'), current: SyncRecord }),
  Type.Object({ opId: OpId, status: Type.Literal('rejected'), reason: SyncRejectReasonSchema }),
]);
export type SyncOpResult = Static<typeof SyncOpResult>;

export const SyncPushRequest = Type.Object({ ops: Type.Array(SyncOp, { minItems: 1, maxItems: SYNC_WIRE_MAX_PUSH_OPS }) });
export type SyncPushRequest = Static<typeof SyncPushRequest>;
export const SyncPushResponse = Type.Object({ results: Type.Array(SyncOpResult), headRevision: Revision });
export type SyncPushResponse = Static<typeof SyncPushResponse>;

export const SyncChangesQuery = Type.Object({
  after: Type.Integer({ minimum: 0 }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});
export type SyncChangesQuery = Static<typeof SyncChangesQuery>;
export const SyncChangesResponse = Type.Object({
  changes: Type.Array(SyncRecord), cursor: Revision, hasMore: Type.Boolean(), floor: Revision, headRevision: Revision,
});
export type SyncChangesResponse = Static<typeof SyncChangesResponse>;

export const SyncSnapshotQuery = Type.Object({
  afterType: Type.Optional(EntityType),
  afterId: Type.Optional(EntityId),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
});
export type SyncSnapshotQuery = Static<typeof SyncSnapshotQuery>;
export const SyncSnapshotResponse = Type.Object({
  records: Type.Array(SyncRecord),
  asOfRevision: Revision,
  next: Type.Union([Type.Object({ afterType: EntityType, afterId: EntityId }), Type.Null()]),
  floor: Revision,
});
export type SyncSnapshotResponse = Static<typeof SyncSnapshotResponse>;

export const SyncStateReport = Type.Object({
  cursor: Revision,
  pending: Count,
  quarantined: Count,
  conflicts: Count,
  stranded: Count,
  categories: SyncCategoryFlags,
  lastSyncAt: NullableIso,
  /** The Agent's sync pause flag (PD-054); absent from older Agents and from browsers. */
  paused: Type.Optional(Type.Boolean()),
});
export type SyncStateReport = Static<typeof SyncStateReport>;
export const SyncStateResponse = Type.Object({ floor: Revision, headRevision: Revision, retentionDays: Type.Integer({ minimum: 1 }) });
export type SyncStateResponse = Static<typeof SyncStateResponse>;

export const SyncDeviceSummary = Type.Object({
  deviceId: DeviceId,
  kind: Type.Union([Type.Literal('desktop'), Type.Literal('browser')]),
  paused: Type.Boolean(),
  cursor: Revision,
  lag: Count,
  lastPushAt: NullableIso,
  lastPullAt: NullableIso,
  quarantined: Count,
  conflicts: Count,
  pending: Count,
});
export type SyncDeviceSummary = Static<typeof SyncDeviceSummary>;
export const SyncSummary = Type.Object({
  floor: Revision,
  headRevision: Revision,
  retentionDays: Type.Integer({ minimum: 1 }),
  counts: CategoryCounts,
  devices: Type.Array(SyncDeviceSummary),
});
export type SyncSummary = Static<typeof SyncSummary>;

export const SyncClearPreview = Type.Object({
  confirmationId: Type.String({ minLength: 1, maxLength: 128 }),
  recordCount: Count,
  deviceCount: Count,
  expiresAt: Iso,
});
export type SyncClearPreview = Static<typeof SyncClearPreview>;
export const SyncClearRequest = Type.Object({ confirmationId: Type.String({ minLength: 1, maxLength: 128 }) });
export type SyncClearRequest = Static<typeof SyncClearRequest>;
export const SyncClearResponse = Type.Object({ deleted: Count, headRevision: Revision });
export type SyncClearResponse = Static<typeof SyncClearResponse>;
