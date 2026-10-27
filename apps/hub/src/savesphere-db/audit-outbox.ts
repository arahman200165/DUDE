import { existsSync } from 'node:fs';
import { isHubAuditEvent } from '@dude/contracts/hub';
import type { HubAuditActorKind, HubAuditEvent, HubAuditOutcome } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import type { HubPaths } from '../config/data-dir.js';
import { sanitizeDetail } from '../security/audit.js';
import type { AuditInput } from '../security/audit.js';
import { openSaveSphereDb } from './open.js';
import type { OpenSaveSphereDbOptions } from './open.js';

/** The detail key that carries the outbox `dedupe_key` into `audit_events`, so a re-run after a crash finds its own row. */
export const OUTBOX_REF_DETAIL_KEY = 'outboxRef';
/** Drained rows are kept this long (diagnosis), then pruned by the next drain. */
export const OUTBOX_DRAINED_RETENTION_MS = 30 * 24 * 3600_000;
const DRAIN_BATCH = 100;

export interface AuditOutboxEvent {
  /** Must be in the closed `HUB_AUDIT_EVENTS` list (widening it is a deliberate, separate decision). */
  event: HubAuditEvent;
  outcome?: HubAuditOutcome;
  actorKind?: HubAuditActorKind;
  actorId?: string;
  /** Plain object under the Hub audit rules (no credentials, at most 2 KiB); validated at append time, inside the transaction. */
  detail?: Record<string, unknown>;
  /** Stable per logical event (for example `item.created:<itemId>:<revision>`); a second append with the same key is a no-op. */
  dedupeKey: string;
  now: number;
}

/**
 * Appends an audit event to `audit_outbox`. Call it INSIDE the transaction that writes the content the event describes
 * (`transaction(sdb, ...)`), so both persist or neither does; it refuses to run outside one. Returns false when the
 * `dedupeKey` already exists. Never touches `dude.db` (no `ATTACH`).
 */
export function appendAuditOutbox(sdb: Db, event: AuditOutboxEvent): boolean {
  if (!sdb.isTransaction) throw new Error('appendAuditOutbox must run inside the transaction that writes the content.');
  if (!isHubAuditEvent(event.event)) throw new Error(`Unknown audit event "${event.event}".`);
  if (event.dedupeKey.length === 0 || event.dedupeKey.length > 256) throw new Error('The outbox dedupe key must be 1 to 256 characters.');
  const payload = sanitizeDetail(event.detail ?? {});
  const result = sdb.prepare(
    'INSERT INTO audit_outbox(event, outcome, actor_kind, actor_id, payload_json, created_at, dedupe_key) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING',
  ).run(event.event, event.outcome ?? 'success', event.actorKind ?? 'system', event.actorId ?? null, payload, new Date(event.now).toISOString(), event.dedupeKey);
  return Number(result.changes) > 0;
}

export interface DrainResult {
  drained: number;
  /** Rows left pending because their write failed (retried by the next drain). */
  failed: number;
}

interface OutboxRow {
  id: number;
  event: string;
  outcome: string;
  actor_kind: string;
  actor_id: string | null;
  payload_json: string;
  created_at: string;
  dedupe_key: string;
}

/**
 * Writes pending `audit_outbox` rows into `dude.db`'s audit log through the existing audit writer, then marks them drained.
 * At-least-once and idempotent: before writing, it looks for an audit row already carrying the row's `outboxRef`, so a crash
 * between the audit write and the `drained_at` update never duplicates the event. A failing row is left pending (it never
 * fails the caller, which has already committed) and later rows are still tried. Call it after the content commit and once
 * at Hub start. Also prunes drained rows past `OUTBOX_DRAINED_RETENTION_MS`.
 */
export function drainAuditOutbox(sdb: Db, hubDb: Db, auditWriter: (input: AuditInput) => void, now: () => number = Date.now): DrainResult {
  let drained = 0;
  let failed = 0;
  let afterId = 0;
  const select = sdb.prepare(
    'SELECT id, event, outcome, actor_kind, actor_id, payload_json, created_at, dedupe_key FROM audit_outbox WHERE drained_at IS NULL AND id > ? ORDER BY id LIMIT ?',
  );
  const existing = hubDb.prepare('SELECT 1 AS x FROM audit_events WHERE event = ? AND at >= ? AND json_extract(detail_json, ?) = ? LIMIT 1');
  const refPath = `$.${OUTBOX_REF_DETAIL_KEY}`;
  for (;;) {
    const rows = select.all(afterId, DRAIN_BATCH) as unknown as OutboxRow[];
    if (rows.length === 0) break;
    for (const row of rows) {
      afterId = row.id;
      try {
        if (existing.get(row.event, row.created_at, refPath, row.dedupe_key) === undefined) {
          const detail = { ...(JSON.parse(row.payload_json) as Record<string, unknown>), [OUTBOX_REF_DETAIL_KEY]: row.dedupe_key };
          auditWriter({
            event: row.event as HubAuditEvent,
            outcome: row.outcome as HubAuditOutcome,
            actorKind: row.actor_kind as HubAuditActorKind,
            ...(row.actor_id === null ? {} : { actorId: row.actor_id }),
            detail,
            now: Date.parse(row.created_at),
          });
        }
        sdb.prepare('UPDATE audit_outbox SET drained_at = ? WHERE id = ? AND drained_at IS NULL').run(new Date(now()).toISOString(), row.id);
        drained += 1;
      } catch {
        failed += 1;
      }
    }
  }
  sdb.prepare('DELETE FROM audit_outbox WHERE drained_at IS NOT NULL AND drained_at < ?').run(new Date(now() - OUTBOX_DRAINED_RETENTION_MS).toISOString());
  return { drained, failed };
}

/**
 * Hub start-up drain: hands over rows a crash left pending. It opens `savesphere.db` only when the file already exists (a Hub
 * that never provisioned SaveSphere gets no file) and closes it again; a refused or unreadable store is skipped, never fatal.
 */
export function drainAuditOutboxAtStart(
  paths: Pick<HubPaths, 'saveSphereDbPath' | 'saveSpherePreMigrationDir'>,
  hubDb: Db,
  auditWriter: (input: AuditInput) => void,
  options: OpenSaveSphereDbOptions = {},
): DrainResult | undefined {
  if (!existsSync(paths.saveSphereDbPath)) return undefined;
  const opened = openSaveSphereDb(paths, options);
  if (opened.status !== 'ready') return undefined;
  try {
    return drainAuditOutbox(opened.store.db, hubDb, auditWriter);
  } finally {
    opened.store.close();
  }
}
