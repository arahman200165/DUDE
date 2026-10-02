import type { Db } from '@dude/sqlite-store';
import { HUB_AUDIT_ACTOR_KINDS, isHubAuditEvent } from '@dude/contracts/hub';
import type { HubAuditActorKind, HubAuditEvent, HubAuditOutcome } from '@dude/contracts/hub';

export const AUDIT_DETAIL_MAX_BYTES = 2048;
export const AUDIT_DETAIL_MAX_DEPTH = 3;
export const AUDIT_RETENTION_MS = 365 * 24 * 3600_000;
export const AUDIT_MAX_ROWS = 100_000;
export const AUDIT_PRUNE_INTERVAL_MS = 24 * 3600_000;

/** Keys that could carry a credential are refused outright, so secrets can never be logged by accident. */
const FORBIDDEN_KEY = /pass|secret|token|code|cookie|authorization|key|csrf/i;

type Primitive = string | number | boolean | null;

function isPrimitive(value: unknown): value is Primitive {
  return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function check(value: unknown, depth: number): void {
  if (depth > AUDIT_DETAIL_MAX_DEPTH) throw new Error('Audit detail is nested too deeply.');
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Audit detail must be a plain object.');
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`Audit detail key "${key}" looks like a credential and is not allowed.`);
    if (isPrimitive(child)) continue;
    if (Array.isArray(child)) {
      if (!child.every(isPrimitive)) throw new Error('Audit detail arrays may contain only primitives.');
      continue;
    }
    check(child, depth + 1);
  }
}

/** Validates and serializes a detail object (primitives, arrays of primitives, nested plain objects to depth 3). */
export function sanitizeDetail(detail: unknown): string {
  check(detail, 1);
  const json = JSON.stringify(detail);
  if (Buffer.byteLength(json, 'utf8') > AUDIT_DETAIL_MAX_BYTES) throw new Error('Audit detail is larger than 2 KiB.');
  return json;
}

export interface AuditInput {
  event: HubAuditEvent;
  outcome: HubAuditOutcome;
  actorKind: HubAuditActorKind;
  actorId?: string;
  ip?: string;
  detail?: Record<string, unknown>;
  now: number;
}

export function audit(db: Db, input: AuditInput): void {
  if (!isHubAuditEvent(input.event)) throw new Error(`Unknown audit event "${input.event}".`);
  if (!(HUB_AUDIT_ACTOR_KINDS as readonly string[]).includes(input.actorKind)) throw new Error('Unknown audit actor kind.');
  const detail = input.detail === undefined ? null : sanitizeDetail(input.detail);
  db.prepare('INSERT INTO audit_events(at, actor_kind, actor_id, event, outcome, ip, detail_json) VALUES(?, ?, ?, ?, ?, ?, ?)').run(
    new Date(input.now).toISOString(), input.actorKind, input.actorId ?? null, input.event, input.outcome, input.ip ?? null, detail,
  );
}

export interface AuditRecord {
  seq: number;
  at: string;
  actorKind: string;
  actorId: string | null;
  event: string;
  outcome: string;
  ip: string | null;
  detail: unknown;
}

interface AuditRow {
  seq: number; at: string; actor_kind: string; actor_id: string | null; event: string; outcome: string; ip: string | null; detail_json: string | null;
}

/** Newest first; pass the last `seq` as `beforeSeq` for the next page. */
export function listAudit(db: Db, options: { beforeSeq?: number; limit?: number } = {}): AuditRecord[] {
  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)));
  const before = options.beforeSeq ?? Number.MAX_SAFE_INTEGER;
  const rows = db
    .prepare('SELECT seq, at, actor_kind, actor_id, event, outcome, ip, detail_json FROM audit_events WHERE seq < ? ORDER BY seq DESC LIMIT ?')
    .all(before, limit) as unknown as AuditRow[];
  return rows.map((r) => ({
    seq: r.seq, at: r.at, actorKind: r.actor_kind, actorId: r.actor_id, event: r.event, outcome: r.outcome, ip: r.ip,
    detail: r.detail_json === null ? null : (JSON.parse(r.detail_json) as unknown),
  }));
}

/** Deletes events older than 365 days, then trims to the newest 100,000 rows. Returns the number deleted. */
export function pruneAudit(db: Db, now: number, maxRows = AUDIT_MAX_ROWS): number {
  const byAge = db.prepare('DELETE FROM audit_events WHERE at < ?').run(new Date(now - AUDIT_RETENTION_MS).toISOString());
  const byCount = db.prepare('DELETE FROM audit_events WHERE seq <= (SELECT MAX(seq) FROM audit_events) - ?').run(maxRows);
  return Number(byAge.changes) + Number(byCount.changes);
}

/** Prunes now and every 24 h. The timer is unref'd; call the returned function to stop it. */
export function startAuditPruning(db: Db, now: () => number = Date.now, intervalMs = AUDIT_PRUNE_INTERVAL_MS): () => void {
  const run = (): void => {
    try { pruneAudit(db, now()); } catch { /* the database may be closing */ }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
