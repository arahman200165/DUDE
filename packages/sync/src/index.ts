// Outbox model and coalescing (31B). Replay, cursors and conflict handling are reserved for Phase 31D.
export { OUTBOX_SCHEMA_VERSION, OUTBOX_MAX_ROWS } from './outbox/outbox-op.model.js';
export type { OutboxOp, OutboxOpKind, OutboxStatus } from './outbox/outbox-op.model.js';
export { coalesceOutbox } from './outbox/coalesce.js';
