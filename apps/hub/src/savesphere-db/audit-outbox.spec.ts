import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transaction } from '@dude/sqlite-store';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { audit, listAudit } from '../security/audit.js';
import type { AuditInput } from '../security/audit.js';
import { appendAuditOutbox, drainAuditOutbox, drainAuditOutboxAtStart } from './audit-outbox.js';
import { openSaveSphereDb } from './open.js';

function setup() {
  const p = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-outbox-')));
  const hub = openHubDb({ dbFile: p.dbFile, preMigrationDir: p.preMigrationDir });
  const store = openSaveSphereDb(p);
  if (hub.status !== 'ready' || store.status !== 'ready') throw new Error('expected ready');
  store.store.db.exec('CREATE TABLE scratch_content (id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT');
  const writer = (db = hub.hub.db) => (input: AuditInput): void => audit(db, input);
  return { p, hub: hub.hub, sdb: store.store.db, store: store.store, writer };
}

const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const event = (key: string, extra: Record<string, unknown> = {}) => ({ event: 'collab.document-kept' as const, dedupeKey: key, now: NOW, detail: { itemCount: 1, ...extra } });
const pending = (sdb: ReturnType<typeof setup>['sdb']) => (sdb.prepare('SELECT COUNT(*) AS n FROM audit_outbox WHERE drained_at IS NULL').get() as { n: number }).n;
const auditRows = (hub: ReturnType<typeof setup>['hub']) => listAudit(hub.db).filter((r) => r.event === 'collab.document-kept');

describe('audit outbox', () => {
  it('persists content and its outbox row together', () => {
    const { sdb } = setup();
    transaction(sdb, () => {
      sdb.prepare('INSERT INTO scratch_content(id, body) VALUES (?, ?)').run('a', 'x');
      expect(appendAuditOutbox(sdb, event('item.created:a:1'))).toBe(true);
    });
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM scratch_content').get()).toEqual({ n: 1 });
    expect(pending(sdb)).toBe(1);
  });

  it('crash injection: a throw mid-transaction leaves neither the content nor the outbox row', () => {
    const { sdb } = setup();
    expect(() => transaction(sdb, () => {
      sdb.prepare('INSERT INTO scratch_content(id, body) VALUES (?, ?)').run('a', 'x');
      appendAuditOutbox(sdb, event('item.created:a:1'));
      throw new Error('crash');
    })).toThrow('crash');
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM scratch_content').get()).toEqual({ n: 0 });
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM audit_outbox').get()).toEqual({ n: 0 });
  });

  it('crash injection: a failing outbox append (secret-looking detail) rolls the content back too', () => {
    const { sdb } = setup();
    expect(() => transaction(sdb, () => {
      sdb.prepare('INSERT INTO scratch_content(id, body) VALUES (?, ?)').run('a', 'x');
      appendAuditOutbox(sdb, event('k', { apiToken: 'nope' }));
    })).toThrow(/credential/);
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM scratch_content').get()).toEqual({ n: 0 });
  });

  it('refuses to run outside the content transaction, with an unknown event or a bad key', () => {
    const { sdb } = setup();
    expect(() => appendAuditOutbox(sdb, event('k'))).toThrow(/inside the transaction/);
    expect(() => transaction(sdb, () => appendAuditOutbox(sdb, { ...event('k'), event: 'not.an.event' as never }))).toThrow(/Unknown audit event/);
    expect(() => transaction(sdb, () => appendAuditOutbox(sdb, event('')))).toThrow(/dedupe key/);
  });

  it('ignores a repeated dedupe key', () => {
    const { sdb } = setup();
    transaction(sdb, () => {
      expect(appendAuditOutbox(sdb, event('same'))).toBe(true);
      expect(appendAuditOutbox(sdb, event('same'))).toBe(false);
    });
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM audit_outbox').get()).toEqual({ n: 1 });
  });

  it('drains into the Hub audit log once, marks rows drained and is idempotent on repeat', () => {
    const { sdb, hub, writer } = setup();
    transaction(sdb, () => { appendAuditOutbox(sdb, event('a')); appendAuditOutbox(sdb, event('b', { n: 2 })); });
    expect(drainAuditOutbox(sdb, hub.db, writer(), () => NOW)).toEqual({ drained: 2, failed: 0 });
    expect(pending(sdb)).toBe(0);
    const rows = auditRows(hub);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => (r.detail as Record<string, unknown>)['outboxRef']).sort()).toEqual(['a', 'b']);
    expect(rows[0]).toMatchObject({ outcome: 'success', actorKind: 'system', at: '2026-10-27T12:00:00.000Z' });
    expect(drainAuditOutbox(sdb, hub.db, writer(), () => NOW)).toEqual({ drained: 0, failed: 0 });
    expect(auditRows(hub)).toHaveLength(2);
  });

  it('never duplicates when a crash lands between the audit write and the drained mark (at-least-once, deduped)', () => {
    const { sdb, hub, writer } = setup();
    transaction(sdb, () => { appendAuditOutbox(sdb, event('a')); });
    // The audit row is written, then the process dies before drained_at is set: simulate by running the writer alone.
    const real = writer();
    const sdbBroken = new Proxy(sdb, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.startsWith('UPDATE audit_outbox SET drained_at')) throw new Error('crash before mark');
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    expect(drainAuditOutbox(sdbBroken, hub.db, real, () => NOW)).toEqual({ drained: 0, failed: 1 });
    expect(pending(sdb)).toBe(1);
    expect(auditRows(hub)).toHaveLength(1);
    expect(drainAuditOutbox(sdb, hub.db, real, () => NOW)).toEqual({ drained: 1, failed: 0 });
    expect(pending(sdb)).toBe(0);
    expect(auditRows(hub)).toHaveLength(1);
  });

  it('leaves a failing row pending, still drains the others and retries later', () => {
    const { sdb, hub, writer } = setup();
    transaction(sdb, () => { appendAuditOutbox(sdb, event('bad')); appendAuditOutbox(sdb, event('good')); });
    const real = writer();
    let fail = true;
    const flaky = (input: AuditInput): void => {
      if (fail && (input.detail as Record<string, unknown>)['outboxRef'] === 'bad') throw new Error('hub db busy');
      real(input);
    };
    expect(drainAuditOutbox(sdb, hub.db, flaky, () => NOW)).toEqual({ drained: 1, failed: 1 });
    expect(pending(sdb)).toBe(1);
    fail = false;
    expect(drainAuditOutbox(sdb, hub.db, flaky, () => NOW)).toEqual({ drained: 1, failed: 0 });
    expect(auditRows(hub)).toHaveLength(2);
  });

  it('prunes drained rows past retention', () => {
    const { sdb, hub, writer } = setup();
    transaction(sdb, () => { appendAuditOutbox(sdb, event('old')); });
    drainAuditOutbox(sdb, hub.db, writer(), () => NOW);
    drainAuditOutbox(sdb, hub.db, writer(), () => NOW + 31 * 24 * 3600_000);
    expect(sdb.prepare('SELECT COUNT(*) AS n FROM audit_outbox').get()).toEqual({ n: 0 });
  });

  it('start-up drain hands over rows a crash left behind, and creates no savesphere.db for a Hub without one', () => {
    const none = hubPaths(mkdtempSync(path.join(os.tmpdir(), 'ss-outbox-none-')));
    const hubOnly = openHubDb({ dbFile: none.dbFile, preMigrationDir: none.preMigrationDir });
    if (hubOnly.status !== 'ready') throw new Error('expected ready');
    expect(drainAuditOutboxAtStart(none, hubOnly.hub.db, (input) => audit(hubOnly.hub.db, input))).toBeUndefined();
    expect(existsSync(none.saveSphereDbPath)).toBe(false);

    const { p, hub, sdb, store } = setup();
    transaction(sdb, () => { appendAuditOutbox(sdb, event('left-behind')); });
    store.close();
    expect(drainAuditOutboxAtStart(p, hub.db, (input) => audit(hub.db, input), { now: () => new Date(NOW) })).toEqual({ drained: 1, failed: 0 });
    expect(auditRows(hub)).toHaveLength(1);
  });
});
