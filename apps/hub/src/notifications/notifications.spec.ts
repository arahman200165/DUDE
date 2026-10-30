import { afterEach, describe, expect, it } from 'vitest';
import { HUB_NOTIFICATION_BODY_MAX, HUB_NOTIFICATION_KINDS } from '@dude/contracts/hub';
import type { HubNotification } from '@dude/contracts/hub';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { updateDestinationState } from '../hub/backup-destination-state.js';
import { audit } from '../security/audit.js';
import { tempDir } from '../server/test-helpers.js';
import { startNotificationProducers } from './producers.js';
import type { NotificationProducers } from './producers.js';
import { DISMISSED_RETENTION_MS, NOTIFICATION_CAP, NOTIFICATION_MAX_AGE_MS, capNotifications, pruneNotifications } from './retention.js';
import { dismissNotification, insertNotification, listNotifications, markNotificationsRead } from './store.js';

const opened: HubDb[] = [];
const stops: Array<() => void> = [];
function open(): HubDb {
  const paths = ensureLayout(tempDir('hub-notif-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return result.hub;
}
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const h of opened.splice(0)) { try { h.close(); } catch { /* already closed */ } }
});

const T0 = Date.UTC(2026, 9, 24, 10, 0, 0);
const HOUR = 3600_000;

interface Fixture { hub: HubDb; clock: { t: number }; emitted: HubNotification[]; producers: NotificationProducers; jobs: ReturnType<typeof createJobRegistry> }
function setup(): Fixture {
  const hub = open();
  const clock = { t: T0 };
  const emitted: HubNotification[] = [];
  const jobs = createJobRegistry({ db: hub.db, now: () => clock.t });
  const producers = startNotificationProducers({ db: hub.db, now: () => clock.t, jobs, emit: (n) => emitted.push(n) });
  stops.push(() => producers.stop());
  return { hub, clock, emitted, producers, jobs };
}

const rows = (f: Fixture): Array<{ kind: string; severity: string; title: string; body: string }> =>
  f.hub.db.prepare('SELECT kind, severity, title, body FROM notifications ORDER BY created_at, id').all() as never;
const system = (f: Fixture, event: Parameters<typeof audit>[1]['event'], outcome: 'success' | 'failure', detail?: Record<string, unknown>): void =>
  audit(f.hub.db, { event, outcome, actorKind: 'system', ...(detail ? { detail } : {}), now: f.clock.t });

describe('notification producers (audit observer)', () => {
  it('maps a failed backup, and the next success after a failure is a recovery (never a plain success)', () => {
    const f = setup();
    system(f, 'backup.created', 'success', { file: 'a.dudebackup', size: 5, trigger: 'schedule' });
    expect(rows(f)).toEqual([]);
    system(f, 'backup.failed', 'failure', { reason: 'schedule-key-missing', trigger: 'schedule' });
    expect(rows(f)).toMatchObject([{ kind: 'backup-failed', severity: 'error', body: expect.stringContaining('(schedule-key-missing)') }]);
    system(f, 'backup.created', 'success', { file: 'b.dudebackup', size: 5, trigger: 'schedule' });
    system(f, 'backup.created', 'success', { file: 'c.dudebackup', size: 5, trigger: 'schedule' });
    expect(rows(f).map((r) => r.kind)).toEqual(['backup-failed', 'backup-recovered']);
    expect(rows(f)[1]).toMatchObject({ severity: 'info' });
    expect(f.emitted.map((n) => n.kind)).toEqual(['backup-failed', 'backup-recovered']);
  });

  it('treats a prune failure as a warning and not as a failed backup that a later success recovers from', () => {
    const f = setup();
    system(f, 'backup.created', 'success', { file: 'a.dudebackup', size: 5, trigger: 'schedule' });
    system(f, 'backup.failed', 'failure', { reason: 'prune-failed', trigger: 'schedule' });
    system(f, 'backup.created', 'success', { file: 'b.dudebackup', size: 5, trigger: 'schedule' });
    expect(rows(f)).toMatchObject([{ kind: 'backup-failed', severity: 'warning' }]);
  });

  it('maps renewals and ACME failures, echoing only a validated expiry date', () => {
    const f = setup();
    system(f, 'tls.renewed', 'success', { notAfter: '2027-01-02T03:04:05.000Z', spki: 'x'.repeat(43), source: 'acme' });
    system(f, 'tls.renewed', 'success', { notAfter: '<script>alert(1)</script>', spki: 'y' });
    system(f, 'tls.acme-failed', 'failure', { names: ['hub.example.com'], directoryHost: 'acme.example.com', problem: 'urn:secret', renewal: true });
    system(f, 'tls.acme-failed', 'failure', { names: ['hub.example.com'] });
    const all = rows(f);
    expect(all.map((r) => [r.kind, r.severity, r.title])).toEqual([
      ['tls-renewed', 'info', 'Hub certificate renewed'], ['tls-renewed', 'info', 'Hub certificate renewed'],
      ['tls-renewal-failed', 'error', 'Certificate renewal failed'], ['tls-renewal-failed', 'error', 'Certificate issuance failed'],
    ]);
    expect(all[0]!.body).toBe('The Hub certificate was renewed through ACME and is valid until 2027-01-02.');
    expect(all[1]!.body).toBe('The Hub certificate was renewed.');
    expect(JSON.stringify(all)).not.toMatch(/urn:secret|script|acme\.example\.com|hub\.example\.com/);
  });

  it('turns an address change into exactly ONE notification (not also a security alert)', () => {
    const f = setup();
    system(f, 'network.address-changed', 'success', { added: ['203.0.113.7'], removed: [] });
    expect(rows(f)).toHaveLength(1);
    expect(rows(f)[0]).toMatchObject({ kind: 'address-changed', severity: 'warning', body: expect.stringContaining('1 added, 0 removed') });
    expect(f.emitted).toHaveLength(1);
  });

  it('turns every other alert event into a security-alert, but a sign-in only from a new address', () => {
    const f = setup();
    audit(f.hub.db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', detail: { newAddress: false }, now: f.clock.t });
    audit(f.hub.db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', detail: { via: 'password' }, now: f.clock.t });
    audit(f.hub.db, { event: 'hub.started', outcome: 'success', actorKind: 'system', now: f.clock.t });
    audit(f.hub.db, { event: 'sync.pushed', outcome: 'success', actorKind: 'device', now: f.clock.t });
    expect(rows(f)).toEqual([]);
    audit(f.hub.db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', detail: { newAddress: true }, now: f.clock.t });
    audit(f.hub.db, { event: 'owner.password-changed', outcome: 'success', actorKind: 'owner', now: f.clock.t });
    audit(f.hub.db, { event: 'device.revoked', outcome: 'success', actorKind: 'owner', detail: { deviceId: 'd' }, now: f.clock.t });
    expect(rows(f)).toEqual([
      { kind: 'security-alert', severity: 'warning', title: 'Security alert', body: 'Signed in from a new address.' },
      { kind: 'security-alert', severity: 'warning', title: 'Security alert', body: 'The owner password was changed.' },
      { kind: 'security-alert', severity: 'warning', title: 'Security alert', body: 'A device was revoked.' },
    ]);
  });

  it('only ever produces kinds from the closed list and keeps every body short', () => {
    const f = setup();
    system(f, 'backup.failed', 'failure', { reason: 'x'.repeat(500) });
    system(f, 'network.address-changed', 'success', { added: Array.from({ length: 16 }, (_, i) => `10.0.0.${i}`), removed: [] });
    for (const r of rows(f)) {
      expect(HUB_NOTIFICATION_KINDS).toContain(r.kind);
      expect(r.body.length).toBeLessThanOrEqual(HUB_NOTIFICATION_BODY_MAX);
    }
    expect(rows(f)[0]!.body).not.toContain('xxxx');
  });

  it('is idempotent per source key', () => {
    const f = setup();
    const first = f.producers.notify({ sourceKey: 'k', kind: 'backup-failed', severity: 'error', title: 'T', body: 'B' });
    const second = f.producers.notify({ sourceKey: 'k', kind: 'backup-failed', severity: 'error', title: 'T', body: 'B' });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(rows(f)).toHaveLength(1);
    expect(f.emitted).toHaveLength(1);
  });

  it('never fails the producer when delivery throws, and stops observing after stop()', () => {
    const hub = open();
    const jobs = createJobRegistry({ db: hub.db, now: () => T0 });
    const producers = startNotificationProducers({ db: hub.db, now: () => T0, jobs, emit: () => { throw new Error('socket'); } });
    audit(hub.db, { event: 'backup.failed', outcome: 'failure', actorKind: 'system', now: T0 });
    expect(hub.db.prepare('SELECT COUNT(*) AS n FROM notifications').get()).toEqual({ n: 1 });
    producers.stop();
    audit(hub.db, { event: 'backup.failed', outcome: 'failure', actorKind: 'system', now: T0 });
    jobs.report('sync-compaction', 'failed', 'The run failed.');
    expect(hub.db.prepare('SELECT COUNT(*) AS n FROM notifications').get()).toEqual({ n: 1 });
  });
});

describe('notification producers (jobs)', () => {
  it('turns a failed leaf renewal or sync compaction into a notification, and nothing else', () => {
    const f = setup();
    f.jobs.report('leaf-renewal', 'success', 'The leaf certificate was renewed.');
    f.jobs.report('sync-compaction', 'skipped', 'Nothing is past the retention window.');
    f.jobs.report('address-watch', 'failed', 'The run failed.');
    f.jobs.report('audit-prune', 'failed', 'The run failed.');
    // An ACME renewal failure is already an audited `tls.acme-failed` row; the job outcome must not add a second notification.
    f.jobs.report('acme-renewal', 'failed', 'The run failed.');
    expect(rows(f)).toEqual([]);
    f.jobs.report('leaf-renewal', 'failed', 'The run failed (EACCES).');
    f.clock.t += 1000;
    f.jobs.report('sync-compaction', 'failed', 'The run failed.');
    expect(rows(f).map((r) => [r.kind, r.severity])).toEqual([['tls-renewal-failed', 'error'], ['sync-compaction-failed', 'error']]);
    expect(JSON.stringify(rows(f))).not.toContain('EACCES');
  });

  it('records a failure thrown inside a tracked run', () => {
    const f = setup();
    expect(() => f.jobs.track('sync-compaction', () => { throw Object.assign(new Error('secret path C:/x'), { code: 'EBUSY' }); })).toThrow();
    expect(rows(f)).toMatchObject([{ kind: 'sync-compaction-failed' }]);
    expect(JSON.stringify(rows(f))).not.toMatch(/secret path|EBUSY/);
  });
});

describe('backup health producers (Milestone 850)', () => {
  const schedule = (hours: number) => ({ intervalHours: hours });
  const dest = [{ id: 'd-1', label: 'USB disk' }];
  const success = (f: Fixture, id: string, at = f.clock.t): void => {
    updateDestinationState(f.hub.db, id, { lastSuccessAt: new Date(at).toISOString(), lastOutcome: 'success' });
  };

  it('stays quiet within twice the interval, notifies exactly at it and then at most once per destination and UTC day', () => {
    const f = setup();
    success(f, 'd-1');
    f.clock.t = T0 + 47 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    expect(rows(f)).toEqual([]);
    f.clock.t = T0 + 48 * HOUR - 1;
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    expect(rows(f)).toEqual([]);
    f.clock.t = T0 + 48 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    expect(rows(f)).toMatchObject([{ kind: 'backup-overdue', severity: 'warning', body: 'No backup to "USB disk" has completed for 2 days; one is due every 24 hours.' }]);
    f.clock.t = T0 + 48 * HOUR + 2 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    expect(rows(f)).toHaveLength(1);
    f.clock.t = T0 + 48 * HOUR + 24 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(24), destinations: dest });
    expect(rows(f)).toHaveLength(2);
  });

  it('measures a never-succeeded destination from the schedule or from when it was added (the later), and never fires without a baseline or a schedule', () => {
    const f = setup();
    f.producers.checkBackupHealth({ schedule: schedule(1), destinations: dest });
    expect(rows(f)).toEqual([]);
    system(f, 'backup.scheduled', 'success', { action: 'set', intervalHours: 1, destinations: 1 });
    f.clock.t = T0 + 5 * HOUR;
    f.producers.checkBackupHealth({ schedule: undefined, destinations: dest });
    expect(rows(f)).toEqual([]);
    f.producers.checkBackupHealth({ schedule: schedule(1), destinations: dest });
    expect(rows(f)).toMatchObject([{ kind: 'backup-overdue', body: 'No backup to "USB disk" has completed for 5 hours; one is due every 1 hours.' }]);
    // A destination added later counts from when it was added.
    system(f, 'backup.destination-added', 'success', { destination: 'd-2', kind: 'local-folder', adopted: false });
    f.clock.t += 1 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(1), destinations: [{ id: 'd-2', label: 'Second' }] });
    expect(rows(f)).toHaveLength(1);
    f.clock.t += 1 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(1), destinations: [{ id: 'd-2', label: 'Second' }] });
    expect(rows(f)).toHaveLength(2);
  });

  it('reports a schedule with no destination once a day, from when the schedule was set', () => {
    const f = setup();
    system(f, 'backup.scheduled', 'success', { intervalHours: 6 });
    f.clock.t = T0 + 11 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(6), destinations: [] });
    expect(rows(f)).toEqual([]);
    f.clock.t = T0 + 12 * HOUR;
    f.producers.checkBackupHealth({ schedule: schedule(6), destinations: [] });
    f.producers.checkBackupHealth({ schedule: schedule(6), destinations: [] });
    expect(rows(f)).toMatchObject([{ kind: 'backup-overdue', severity: 'warning', body: expect.stringContaining('no backup destination exists') }]);
  });

  it('notifies only for the destination that is overdue', () => {
    const f = setup();
    system(f, 'backup.scheduled', 'success', { action: 'set', intervalHours: 1 });
    const two = [...dest, { id: 'd-2', label: 'Cloud' }];
    f.clock.t = T0 + 3 * HOUR;
    success(f, 'd-2');
    f.producers.checkBackupHealth({ schedule: schedule(1), destinations: two });
    expect(rows(f)).toHaveLength(1);
    expect(rows(f)[0]!.body).toContain('"USB disk"');
    expect(rows(f)[0]!.body).not.toContain('Cloud');
  });

  it('maps a failed v2 run once per destination, reason and day, ignores the no-destination record and recovers per destination', () => {
    const f = setup();
    system(f, 'backup.v2-failed', 'failure', { reason: 'no-destination', trigger: 'schedule' });
    expect(rows(f)).toEqual([]);
    system(f, 'backup.v2-created', 'success', { destination: 'd-1', backupId: 'b0' });
    system(f, 'backup.v2-failed', 'failure', { destination: 'd-1', reason: 'ENOSPC', trigger: 'schedule' });
    system(f, 'backup.v2-failed', 'failure', { destination: 'd-1', reason: 'ENOSPC', trigger: 'schedule' });
    expect(rows(f)).toMatchObject([{ kind: 'backup-failed', severity: 'error', title: 'A backup failed', body: expect.stringContaining('(ENOSPC)') }]);
    system(f, 'backup.v2-created', 'success', { destination: 'd-2', backupId: 'b1' });
    expect(rows(f)).toHaveLength(1);
    system(f, 'backup.v2-created', 'success', { destination: 'd-1', backupId: 'b2' });
    system(f, 'backup.v2-created', 'success', { destination: 'd-1', backupId: 'b3' });
    expect(rows(f).map((r) => r.kind)).toEqual(['backup-failed', 'backup-recovered']);
    f.clock.t += 24 * HOUR;
    system(f, 'backup.v2-failed', 'failure', { destination: 'd-1', reason: 'ENOSPC', trigger: 'schedule' });
    expect(rows(f)).toHaveLength(3);
  });

  it('maps a failed restore drill once a day per destination and echoes only ids and a validated code', () => {
    const f = setup();
    system(f, 'backup.drill-passed', 'success', { destination: 'd-1', backupId: 'b0' });
    expect(rows(f)).toEqual([]);
    system(f, 'backup.drill-failed', 'failure', { destination: 'd-1', reason: 'integrity-failed', trigger: 'schedule' });
    system(f, 'backup.drill-failed', 'failure', { destination: 'd-1', reason: 'integrity-failed', trigger: 'manual' });
    system(f, 'backup.drill-failed', 'failure', { destination: 'd-2', reason: 'C:\\Users\\x\\secret', trigger: 'schedule' });
    expect(rows(f)).toMatchObject([
      { kind: 'backup-failed', severity: 'error', title: 'A restore drill failed', body: expect.stringContaining('(integrity-failed)') },
      { kind: 'backup-failed', title: 'A restore drill failed' },
    ]);
    expect(rows(f)).toHaveLength(2);
    expect(JSON.stringify(rows(f))).not.toContain('secret');
    for (const r of rows(f)) expect(HUB_NOTIFICATION_KINDS).toContain(r.kind);
  });

  it('echoes the destination label from the injected lookup, never a path', () => {
    const hub = open();
    const jobs = createJobRegistry({ db: hub.db, now: () => T0 });
    const producers = startNotificationProducers({ db: hub.db, now: () => T0, jobs, emit: () => undefined, destinationLabel: (id) => (id === 'd-1' ? 'USB disk' : null) });
    stops.push(() => producers.stop());
    audit(hub.db, { event: 'backup.drill-failed', outcome: 'failure', actorKind: 'system', detail: { destination: 'd-1', reason: 'timeout', folder: 'C:\\secret' }, now: T0 });
    const body = (hub.db.prepare('SELECT body FROM notifications').get() as { body: string }).body;
    expect(body).toContain('"USB disk"');
    expect(body).not.toContain('secret');
  });
});

describe('notification store', () => {
  it('lists newest first, hides dismissed ones by default and counts unread across the whole store', () => {
    const { db } = open();
    const ids = ['a', 'b', 'c'].map((key, i) => insertNotification(db, T0 + i * 1000, { sourceKey: key, kind: 'backup-failed', severity: 'error', title: `T${key}`, body: 'B' })!.id);
    expect(listNotifications(db)).toMatchObject({ unread: 3, notifications: [{ title: 'Tc' }, { title: 'Tb' }, { title: 'Ta' }] });
    expect(markNotificationsRead(db, T0 + 5000, { ids: [ids[0]!, 'unknown'] })).toBe(1);
    expect(markNotificationsRead(db, T0 + 6000, { ids: [ids[0]!] })).toBe(0);
    expect(listNotifications(db).unread).toBe(2);
    expect(listNotifications(db).notifications.find((n) => n.id === ids[0])!.readAt).toBe(new Date(T0 + 5000).toISOString());
    expect(dismissNotification(db, T0 + 7000, ids[1]!)).toBe(true);
    expect(dismissNotification(db, T0 + 8000, ids[1]!)).toBe(true);
    expect(dismissNotification(db, T0 + 8000, 'unknown')).toBe(false);
    const visible = listNotifications(db);
    expect(visible.notifications.map((n) => n.id)).toEqual([ids[2], ids[0]]);
    expect(visible.unread).toBe(1);
    const all = listNotifications(db, { includeDismissed: true });
    expect(all.notifications).toHaveLength(3);
    // Dismissing also reads, once, at the first dismissal.
    expect(all.notifications.find((n) => n.id === ids[1])).toMatchObject({ readAt: new Date(T0 + 7000).toISOString(), dismissedAt: new Date(T0 + 7000).toISOString() });
    expect(markNotificationsRead(db, T0 + 9000, { all: true })).toBe(1);
    expect(listNotifications(db).unread).toBe(0);
  });

  it('clips an over-long title and body instead of storing them', () => {
    const { db } = open();
    const stored = insertNotification(db, T0, { sourceKey: 'long', kind: 'security-alert', severity: 'warning', title: 't'.repeat(500), body: 'b'.repeat(2000) })!;
    expect(stored.title.length).toBeLessThanOrEqual(120);
    expect(stored.body.length).toBe(HUB_NOTIFICATION_BODY_MAX);
  });
});

describe('notification retention', () => {
  const add = (db: HubDb['db'], key: string, createdAt: number, dismissedAt: number | null = null): void => {
    db.prepare('INSERT INTO notifications(id, created_at, source_key, kind, severity, title, body, dismissed_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)').run(
      key, new Date(createdAt).toISOString(), key, 'backup-failed', 'error', 'T', 'B', dismissedAt === null ? null : new Date(dismissedAt).toISOString(),
    );
  };
  const left = (db: HubDb['db']): string[] => (db.prepare('SELECT id FROM notifications ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id);

  it('removes dismissed notifications after 30 days and every notification after 90', () => {
    const { db } = open();
    const now = T0 + 200 * 24 * HOUR;
    add(db, 'fresh', now - HOUR);
    add(db, 'old-undismissed-80d', now - 80 * 24 * HOUR);
    add(db, 'dismissed-29d', now - 40 * 24 * HOUR, now - (DISMISSED_RETENTION_MS - HOUR));
    add(db, 'dismissed-31d', now - 40 * 24 * HOUR, now - (DISMISSED_RETENTION_MS + HOUR));
    add(db, 'too-old', now - (NOTIFICATION_MAX_AGE_MS + HOUR));
    add(db, 'too-old-dismissed-recently', now - (NOTIFICATION_MAX_AGE_MS + HOUR), now - HOUR);
    expect(pruneNotifications(db, now)).toBe(3);
    expect(left(db)).toEqual(['dismissed-29d', 'fresh', 'old-undismissed-80d']);
    expect(pruneNotifications(db, now)).toBe(0);
  });

  it('keeps the newest 500 on insert and in a prune', () => {
    const { db } = open();
    for (let i = 0; i < NOTIFICATION_CAP + 5; i += 1) insertNotification(db, T0 + i * 1000, { sourceKey: `k${i}`, kind: 'backup-failed', severity: 'error', title: `T${i}`, body: 'B' });
    const titles = (db.prepare('SELECT title FROM notifications').all() as Array<{ title: string }>).map((r) => r.title);
    expect(titles).toHaveLength(NOTIFICATION_CAP);
    expect(titles).not.toContain('T0');
    expect(titles).toContain(`T${NOTIFICATION_CAP + 4}`);
    expect(capNotifications(db, 10)).toBe(NOTIFICATION_CAP - 10);
    expect(db.prepare('SELECT COUNT(*) AS n FROM notifications').get()).toEqual({ n: 10 });
    expect(pruneNotifications(db, T0 + 1000 * (NOTIFICATION_CAP + 5), 3)).toBe(7);
  });
});
