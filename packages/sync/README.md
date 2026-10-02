# @dude/sync

Phase 31B provides the local outbox model (`OutboxOp`, `OutboxStatus`, `OUTBOX_MAX_ROWS`) and `coalesceOutbox`, which keeps one op per entity. Dependency-free and storage-agnostic.

Replay, cursors, conflict handling and transport are reserved for Phase 31D.
