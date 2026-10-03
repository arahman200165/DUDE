# @dude/sync

Portable sync core, dependency-free and storage-agnostic:

- Outbox model (`OutboxOp`, `OutboxStatus`: `unsent-standalone | pending | quarantined | stranded`, `OUTBOX_MAX_ROWS`) and `coalesceOutbox`, which keeps one op per entity.
- Sync categories (`SYNC_CATEGORIES`, `defaultCategoryMap`) and per-entity policies (`SYNC_POLICIES`, `syncPolicyFor`, `categoryOf`, `SINGLETON_ENTITY_TYPES`).
- `merge3` (top-level three-way merge with `max-iso` field rules) and `deepEqual`.
- `SYNC_LIMITS`, the `SyncPhase`/`SyncStatus` state model and `stripNonSyncable`.

Replay, cursors and conflict handling are being built in Phase 31D on top of these; transport lives in `@dude/api-client`.
