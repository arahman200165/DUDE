// Portable sync core: outbox model and coalescing (31B); categories, policies, three-way merge, limits,
// status model and preference stripping (31D). Replay, cursors and conflict handling build on these in 31D.
export { OUTBOX_SCHEMA_VERSION, OUTBOX_MAX_ROWS } from './outbox/outbox-op.model.js';
export type { OutboxOp, OutboxOpKind, OutboxStatus } from './outbox/outbox-op.model.js';
export { coalesceOutbox } from './outbox/coalesce.js';
export { SYNC_CATEGORY_IDS, SYNC_CATEGORIES, defaultCategoryMap } from './categories.js';
export type { SyncCategory, SyncCategoryDefinition } from './categories.js';
export {
  SYNC_ENTITY_TYPES, SYNC_POLICIES, SINGLETON_ENTITY_TYPES, syncPolicyFor, isSyncEntityType, categoryOf,
} from './policies.js';
export type { SyncEntityType, ConflictPolicy, ApplyMode, FieldRule, SyncPolicy } from './policies.js';
export { merge3, deepEqual } from './merge3.js';
export type { Merge3Result } from './merge3.js';
export { SYNC_LIMITS } from './limits.js';
export type { SyncPhase, SyncStatus } from './status.js';
export { stripNonSyncable } from './strip-non-syncable.js';
export { diffJson, hasDifferences, stableJson } from './json-diff.js';
export type { DiffKind, DiffRow } from './json-diff.js';
export { describeSync } from './sync-display.js';
export type { SyncDisplay, SyncIndicatorKind } from './sync-display.js';
