# @dude/sync

Portable sync core, dependency-free and storage-agnostic:

- Outbox model (`OutboxOp`, `OutboxStatus`: `unsent-standalone | pending | quarantined | stranded`, `OUTBOX_MAX_ROWS`) and `coalesceOutbox`, which keeps one op per entity.
- Sync categories (`SYNC_CATEGORIES`, `defaultCategoryMap`) and per-entity policies (`SYNC_POLICIES`, `syncPolicyFor`, `categoryOf`, `SINGLETON_ENTITY_TYPES`).
- `merge3` (top-level three-way merge with `max-iso` field rules) and `deepEqual`.
- `SYNC_LIMITS`, the `SyncPhase`/`SyncStatus` state model and `stripNonSyncable`.

Phase 31D adds the synchronization core on top of these: the nine categories and their consent defaults, `SYNC_POLICIES`, the three-way field merge, `SYNC_LIMITS`, `SyncStatus`, `stripNonSyncable` and the pure JSON diff and display helpers. Transport lives in `@dude/api-client`; the replay, cursor and conflict engine lives in `apps/device-agent`.
