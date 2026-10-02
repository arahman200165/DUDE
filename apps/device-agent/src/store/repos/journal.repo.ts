import type { Db } from '@dude/sqlite-store';
import { transaction } from '@dude/sqlite-store';

export type JournalEngineName = 'fs' | 'sys';
/** The fields the store needs from an fs/sys journal entry; the rest is opaque JSON. */
export interface JournalEntryBase { readonly planId: string; readonly appliedAt: string }

/** Same id rule as the on-disk `JsonJournal`. */
const JOURNAL_ID = /^[0-9a-f-]{36}$/;

function assertEngine(engine: unknown): asserts engine is JournalEngineName {
  if (engine !== 'fs' && engine !== 'sys') throw new Error('Invalid journal engine.');
}

function appliedMs(entry: JournalEntryBase): number {
  const ms = Date.parse(entry.appliedAt);
  if (Number.isNaN(ms)) throw new Error('Invalid journal appliedAt.');
  return ms;
}

/** Insert or replace an entry (JsonJournal.write semantics). */
export function appendJournal<E extends JournalEntryBase>(db: Db, engine: JournalEngineName, entry: E): void {
  assertEngine(engine);
  if (typeof entry.planId !== 'string' || !JOURNAL_ID.test(entry.planId)) throw new Error('Invalid journal id.');
  db.prepare(
    `INSERT INTO mutation_journal(engine, plan_id, applied_at, entry_json) VALUES(?, ?, ?, ?)
     ON CONFLICT(engine, plan_id) DO UPDATE SET applied_at = excluded.applied_at, entry_json = excluded.entry_json`,
  ).run(engine, entry.planId, appliedMs(entry), JSON.stringify(entry));
}

/** Newest first by appliedAt. */
export function listJournal<E extends JournalEntryBase = JournalEntryBase>(db: Db, engine: JournalEngineName, limit?: number): E[] {
  assertEngine(engine);
  const rows = (limit === undefined
    ? db.prepare('SELECT entry_json FROM mutation_journal WHERE engine = ? ORDER BY applied_at DESC, rowid DESC').all(engine)
    : db.prepare('SELECT entry_json FROM mutation_journal WHERE engine = ? ORDER BY applied_at DESC, rowid DESC LIMIT ?').all(engine, Math.max(0, Math.floor(limit)))) as unknown as Array<{ entry_json: string }>;
  return rows.map((r) => JSON.parse(r.entry_json) as E);
}

/** Null for an unknown or malformed id (JsonJournal.read semantics). */
export function getJournal<E extends JournalEntryBase = JournalEntryBase>(db: Db, engine: JournalEngineName, planId: string): E | null {
  assertEngine(engine);
  if (typeof planId !== 'string' || !JOURNAL_ID.test(planId)) return null;
  const row = db.prepare('SELECT entry_json FROM mutation_journal WHERE engine = ? AND plan_id = ?').get(engine, planId) as unknown as { entry_json: string } | undefined;
  return row ? (JSON.parse(row.entry_json) as E) : null;
}

/** Replace an existing entry; false when it does not exist. The entry's planId must match. */
export function updateJournal<E extends JournalEntryBase>(db: Db, engine: JournalEngineName, planId: string, entry: E): boolean {
  assertEngine(engine);
  if (entry.planId !== planId) throw new Error('Journal entry planId mismatch.');
  return transaction(db, () => {
    if (getJournal(db, engine, planId) === null) return false;
    appendJournal(db, engine, entry);
    return true;
  });
}

/** Remove one entry (JsonJournal.remove); a malformed id is a no-op. */
export function removeJournal(db: Db, engine: JournalEngineName, planId: string): void {
  assertEngine(engine);
  if (typeof planId !== 'string' || !JOURNAL_ID.test(planId)) return;
  db.prepare('DELETE FROM mutation_journal WHERE engine = ? AND plan_id = ?').run(engine, planId);
}

/** Drop the oldest entries beyond `max`; returns the removed entries (what JsonJournal.trimTo passes to onRemove). */
export function trimJournal<E extends JournalEntryBase = JournalEntryBase>(db: Db, engine: JournalEngineName, max: number): E[] {
  assertEngine(engine);
  return transaction(db, () => {
    const doomed = listJournal<E>(db, engine).slice(Math.max(0, Math.floor(max)));
    const del = db.prepare('DELETE FROM mutation_journal WHERE engine = ? AND plan_id = ?');
    for (const entry of doomed) del.run(engine, entry.planId);
    return doomed;
  });
}
