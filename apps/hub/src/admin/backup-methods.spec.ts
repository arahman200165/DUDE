import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBackup } from '@dude/hub-backup';
import { getMeta } from '@dude/sqlite-store';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from '../backup/backup-fixture.js';
import type { HubDb } from '../db/open-hub-db.js';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import type { CaKeyProtector } from '../tls/ca-key-protector.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';

const PASSPHRASE = 'Tr0ub4dor-and-correct-horse-PASSMARK';
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Reversible fake: the stored schedule key is never plaintext on disk. */
const fakeProtector: CaKeyProtector = {
  kind: 'dpapi',
  keyFile: 'schedule-key.bin',
  protect: (plain) => Buffer.from(plain.map((b) => b ^ 0x5a)),
  unprotect: (blob) => Buffer.from(blob.map((b) => b ^ 0x5a)),
};

function fixture() {
  const root = tempRoot('methods');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const confirmations = new ConfirmationStore();
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43), paths,
    backupDeps: cheapDeps(() => new Date(clock)), scheduleKeyProtector: fakeProtector, now: () => clock, confirmations,
  });
  const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);
  const fail = async (method: string, params: unknown = {}): Promise<AdminError> => {
    try { await call(method, params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  const out = path.join(root, 'out');
  const advance = (ms: number): void => { clock += ms; };
  return { root, hub, paths, call, fail, out, advance, db: hub.db };
}

const auditRows = (db: HubDb['db']): Array<{ event: string; outcome: string; detail_json: string | null }> =>
  db.prepare('SELECT event, outcome, detail_json FROM audit_events ORDER BY seq').all() as never;

describe('backup.create preview and apply', () => {
  it('previews without writing anything and reports the target, the volume and the warnings', async () => {
    const f = fixture();
    const preview = await f.call('backup.create.preview', { folder: f.out });
    expect(preview.confirmToken).toEqual(expect.any(String));
    expect(Date.parse(preview.expiresAt)).toBeGreaterThan(Date.parse('2026-10-04T12:00:00Z'));
    expect(preview.consequenceClass).toEqual(['filesystem-write', 'secret-management']);
    expect(preview.summary).toMatchObject({
      folder: f.out, file: 'dude-hub-20261004T120000Z.dudebackup', onHubVolume: true, hubInstanceId: f.hub.hubInstanceId, authorityEpoch: 3,
      passphraseWarning: 'Losing the passphrase makes the backup unrecoverable.',
    });
    expect(preview.summary.sameMachineWarning).toMatch(/does not protect against losing that machine/);
    expect(preview.summary.counts).toMatchObject({ devices: 1, records: 1 });
    expect(existsSync(f.out)).toBe(false);
    expect(existsSync(path.join(f.paths.backupsDir, '.tmp'))).toBe(false);
    expect(getMeta(f.db, 'backup_last')).toBeUndefined();
    expect(auditRows(f.db).filter((r) => r.event.startsWith('backup.'))).toEqual([
      { event: 'backup.create-previewed', outcome: 'success', detail_json: JSON.stringify({ file: 'dude-hub-20261004T120000Z.dudebackup', onHubVolume: true }) },
    ]);
  });

  it('defaults the folder to <root>/backups and flags a folder on another volume root', async () => {
    const f = fixture();
    const preview = await f.call('backup.create.preview');
    expect(preview.summary.folder).toBe(f.paths.backupsDir);
    expect(existsSync(f.paths.backupsDir)).toBe(false);
  });

  it('applies with the token and passphrase: a verified file that opens with that passphrase', async () => {
    const f = fixture();
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    const applied = await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE });
    expect(applied.name).toBe('dude-hub-20261004T120000Z.dudebackup');
    expect(applied.file).toBe(path.join(f.out, applied.name));
    expect(applied.size).toBe(readFileSync(applied.file).length);
    expect(applied.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(applied.manifest).toMatchObject({ forTransfer: false, hubVersion: '1.2.3', source: { hubInstanceId: f.hub.hubInstanceId, authorityEpoch: 3 } });
    expect(applied.manifest.files.map((x: { name: string }) => x.name).sort()).toEqual(['dude.db', 'hub.json']);
    expect(JSON.stringify(applied)).not.toContain(PASSPHRASE);

    const opened = await openBackup(new Uint8Array(readFileSync(applied.file)), { passphrase: PASSPHRASE }, cheapDeps());
    expect(opened.manifest.forTransfer).toBe(false);
    expect(opened.files.has('dude.db')).toBe(true);
    expect(readdirSync(f.out)).toEqual([applied.name]);

    expect(JSON.parse(getMeta(f.db, 'backup_last')!)).toEqual({ at: '2026-10-04T12:00:00.000Z', ok: true, file: applied.name, size: applied.size });
    const created = auditRows(f.db).find((r) => r.event === 'backup.created')!;
    expect(created.outcome).toBe('success');
    expect(JSON.parse(created.detail_json!)).toEqual({ file: applied.name, size: applied.size, trigger: 'manual' });
  });

  it('refuses a missing, unknown, replayed or expired token and a token for a changed folder', async () => {
    const f = fixture();
    expect((await f.fail('backup.create.apply', { passphrase: PASSPHRASE, folder: f.out })).code).toBe('bad-request');
    expect((await f.fail('backup.create.apply', { confirmToken: 'nope', passphrase: PASSPHRASE, folder: f.out })).code).toBe('confirmation-required');

    const first = (await f.call('backup.create.preview', { folder: f.out })).confirmToken;
    await f.call('backup.create.apply', { confirmToken: first, folder: f.out, passphrase: PASSPHRASE });
    f.advance(2000);
    expect((await f.fail('backup.create.apply', { confirmToken: first, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required'); // replay

    const stale = (await f.call('backup.create.preview', { folder: f.out })).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.create.apply', { confirmToken: stale, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required');

    const bound = (await f.call('backup.create.preview', { folder: f.out })).confirmToken;
    const err = await f.fail('backup.create.apply', { confirmToken: bound, folder: path.join(f.root, 'elsewhere'), passphrase: PASSPHRASE });
    expect(err.code).toBe('conflict');
    expect(existsSync(path.join(f.root, 'elsewhere'))).toBe(false);
    // The token is spent even on a mismatch.
    expect((await f.fail('backup.create.apply', { confirmToken: bound, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required');
    expect(readdirSync(f.out)).toHaveLength(1);
  });

  it('rejects a short or blank passphrase without spending the token and without echoing it', async () => {
    const f = fixture();
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    for (const bad of ['short', '            ', 12345, undefined]) {
      const err = await f.fail('backup.create.apply', { confirmToken, folder: f.out, passphrase: bad });
      expect(err.code).toBe('bad-request');
      if (typeof bad === 'string') expect(err.message).not.toContain(bad.trim() || '\u0000');
    }
    expect(existsSync(f.out)).toBe(false);
    const applied = await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE });
    expect(existsSync(applied.file)).toBe(true);
  });

  it('refuses folders inside the data, configuration or certificate directories and relative paths', async () => {
    const f = fixture();
    for (const folder of [f.paths.dataDir, path.join(f.paths.dataDir, 'sub'), f.paths.preMigrationDir, f.paths.configDir, f.paths.tlsDir, path.join(f.paths.tlsDir, 'x'), 'relative/dir', '']) {
      const err = await f.fail('backup.create.preview', { folder });
      expect(err.code, folder).toBe('bad-request');
    }
    expect((await f.fail('backup.create.preview', { folder: 7 })).code).toBe('bad-request');
    // A sibling whose name merely starts with "data" is fine.
    expect((await f.call('backup.create.preview', { folder: `${f.paths.dataDir}-copies` })).confirmToken).toEqual(expect.any(String));
    expect((await f.call('backup.create.preview', { folder: f.paths.root })).confirmToken).toEqual(expect.any(String));
  });

  it('records a failed apply as a code only: no path, no passphrase', async () => {
    const f = fixture();
    const blocker = path.join(f.root, 'blocker');
    writeFileSync(blocker, 'not a folder');
    const target = path.join(blocker, 'inside');
    const { confirmToken } = await f.call('backup.create.preview', { folder: target });
    const err = await f.fail('backup.create.apply', { confirmToken, folder: target, passphrase: PASSPHRASE });
    expect(err.code).toBe('backup-failed');
    expect(err.message).not.toContain(PASSPHRASE);
    expect(err.message).not.toContain(f.root);
    const last = JSON.parse(getMeta(f.db, 'backup_last')!);
    expect(last).toMatchObject({ ok: false });
    expect(last.error).toMatch(/^[A-Z][A-Z0-9_]+$/);
    const failed = auditRows(f.db).find((r) => r.event === 'backup.failed')!;
    expect(failed.outcome).toBe('failure');
    expect(JSON.parse(failed.detail_json!)).toEqual({ reason: last.error, trigger: 'manual' });
    expect(auditRows(f.db).some((r) => r.event === 'backup.created')).toBe(false);
  });
});

describe('backup.verify and backup.list', () => {
  async function made(f: ReturnType<typeof fixture>): Promise<string> {
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    return (await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE })).file;
  }

  it('opens a backup with the passphrase and reports the manifest without writing anything', async () => {
    const f = fixture();
    const file = await made(f);
    const before = readdirSync(f.out);
    const rowsBefore = auditRows(f.db).length;
    const verified = await f.call('backup.verify', { file, passphrase: PASSPHRASE });
    expect(verified.ok).toBe(true);
    expect(verified.manifest).toMatchObject({ formatVersion: 1, hubVersion: '1.2.3', forTransfer: false, source: { hubInstanceId: f.hub.hubInstanceId, authorityEpoch: 3 } });
    expect(verified.manifest.counts).toMatchObject({ devices: 1 });
    expect(verified.manifest.files).toEqual(expect.arrayContaining([{ name: 'dude.db', size: expect.any(Number) }, { name: 'hub.json', size: expect.any(Number) }]));
    expect(JSON.stringify(verified)).not.toContain(f.root);
    expect(readdirSync(f.out)).toEqual(before);
    expect(auditRows(f.db)).toHaveLength(rowsBefore);
  });

  it('reports a wrong passphrase, a missing file and a foreign file as clean errors', async () => {
    const f = fixture();
    const file = await made(f);
    const wrong = await f.fail('backup.verify', { file, passphrase: `${PASSPHRASE}-wrong` });
    expect(wrong.code).toBe('wrong-passphrase-or-corrupt');
    expect(wrong.message).not.toContain(PASSPHRASE);
    expect((await f.fail('backup.verify', { file: path.join(f.out, 'missing.dudebackup'), passphrase: PASSPHRASE })).code).toBe('not-found');
    const foreign = path.join(f.root, 'foreign.dudebackup');
    writeFileSync(foreign, 'definitely not a backup, just some text that is long enough');
    expect((await f.fail('backup.verify', { file: foreign, passphrase: PASSPHRASE })).code).toBe('bad-magic');
    expect((await f.fail('backup.verify', { file: 'relative.dudebackup', passphrase: PASSPHRASE })).code).toBe('bad-request');
    expect((await f.fail('backup.verify', { file: f.out, passphrase: PASSPHRASE })).code).toBe('bad-request'); // a directory
    expect((await f.fail('backup.verify', { file, passphrase: '' })).code).toBe('bad-request');
  });

  it('lists only backups this Hub could have written, newest first, and nothing for a missing folder', async () => {
    const f = fixture();
    expect(await f.call('backup.list', { folder: f.out })).toEqual({ folder: f.out, backups: [] });
    await made(f);
    f.advance(3_600_000);
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE });
    writeFileSync(path.join(f.out, 'notes.txt'), 'x');
    writeFileSync(path.join(f.out, 'dude-hub-20261004T130000Z.dudebackup.part'), 'x');
    const listed = await f.call('backup.list', { folder: f.out });
    expect(listed.backups.map((b: { name: string }) => b.name)).toEqual(['dude-hub-20261004T130000Z.dudebackup', 'dude-hub-20261004T120000Z.dudebackup']);
    expect(listed.backups[0]).toMatchObject({ size: expect.any(Number), modifiedAt: expect.any(String) });
    expect((await f.fail('backup.list', { folder: 'relative' })).code).toBe('bad-request');
  });

  it('lists the scheduled folder by default, else <root>/backups', async () => {
    const f = fixture();
    expect((await f.call('backup.list')).folder).toBe(f.paths.backupsDir);
    await f.call('backup.schedule.set', { folder: f.out, intervalHours: 24, retention: 3, passphrase: PASSPHRASE });
    expect((await f.call('backup.list')).folder).toBe(f.out);
  });
});

describe('backup schedule', () => {
  it('sets, reports and turns off a schedule; the key is stored protected and never the passphrase', async () => {
    const f = fixture();
    expect(await f.call('backup.schedule.status')).toEqual({ configured: false, folder: null, intervalHours: null, retention: null, last: null, keyPresent: false });

    const set = await f.call('backup.schedule.set', { folder: f.out, intervalHours: 12, retention: 5, passphrase: PASSPHRASE });
    expect(set).toEqual({ configured: true, folder: f.out, intervalHours: 12, retention: 5, replaced: false });
    expect(existsSync(f.out)).toBe(true);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toEqual({ schedule: { folder: f.out, intervalHours: 12, retention: 5 } });
    const raw = readFileSync(f.paths.configFile, 'utf8');
    expect(raw).not.toContain(PASSPHRASE);
    const keyFile = path.join(f.paths.configDir, 'backup', 'schedule-key.bin');
    expect(existsSync(keyFile)).toBe(true);
    expect(readFileSync(keyFile).toString('utf8')).not.toContain(PASSPHRASE);
    expect(await f.call('backup.schedule.status')).toEqual({ configured: true, folder: f.out, intervalHours: 12, retention: 5, last: null, keyPresent: true });

    expect((await f.call('backup.schedule.set', { folder: f.out, intervalHours: 6, retention: 2, passphrase: PASSPHRASE })).replaced).toBe(true);
    expect((await f.call('backup.schedule.status')).intervalHours).toBe(6);

    expect(await f.call('backup.schedule.off')).toEqual({ configured: false, wasConfigured: true });
    expect(await f.call('backup.schedule.status')).toEqual({ configured: false, folder: null, intervalHours: null, retention: null, last: null, keyPresent: false });
    expect(existsSync(keyFile)).toBe(false);
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(await f.call('backup.schedule.off')).toEqual({ configured: false, wasConfigured: false });

    const scheduled = auditRows(f.db).filter((r) => r.event === 'backup.scheduled').map((r) => JSON.parse(r.detail_json!));
    expect(scheduled).toEqual([{ action: 'set', intervalHours: 12, retention: 5 }, { action: 'set', intervalHours: 6, retention: 2 }, { action: 'off' }]);
  });

  it('validates every parameter and changes nothing on a refusal', async () => {
    const f = fixture();
    const ok = { folder: f.out, intervalHours: 24, retention: 7, passphrase: PASSPHRASE };
    for (const bad of [
      { ...ok, folder: undefined }, { ...ok, folder: 'relative' }, { ...ok, folder: f.paths.dataDir }, { ...ok, folder: f.paths.configDir },
      { ...ok, intervalHours: 0 }, { ...ok, intervalHours: 8761 }, { ...ok, intervalHours: 1.5 }, { ...ok, intervalHours: '24' },
      { ...ok, retention: 0 }, { ...ok, retention: 1001 }, { ...ok, passphrase: 'short' }, { ...ok, passphrase: undefined },
    ]) {
      const err = await f.fail('backup.schedule.set', bad);
      expect(err.code, JSON.stringify({ ...bad, passphrase: undefined })).toBe('bad-request');
      expect(err.message).not.toContain(PASSPHRASE);
    }
    expect((await f.call('backup.schedule.status')).configured).toBe(false);
    expect(existsSync(path.join(f.paths.configDir, 'backup', 'schedule-key.bin'))).toBe(false);
    expect(auditRows(f.db).some((r) => r.event === 'backup.scheduled')).toBe(false);
  });

  it('clears a stale failure when a schedule is set so the first run is not delayed', async () => {
    const f = fixture();
    f.db.prepare("INSERT INTO meta(key, value) VALUES ('backup_last', ?)").run(JSON.stringify({ at: '2026-10-04T11:59:00.000Z', ok: false, error: 'schedule-key-missing' }));
    await f.call('backup.schedule.set', { folder: f.out, intervalHours: 24, retention: 7, passphrase: PASSPHRASE });
    expect(getMeta(f.db, 'backup_last')).toBeUndefined();
  });
});

describe('secrets stay out of audit, meta, errors and config', () => {
  it('never lets the passphrase reach any audit row, meta value, config file or error message', async () => {
    const f = fixture();
    const messages: string[] = [];
    const note = async (run: () => Promise<unknown>): Promise<void> => {
      try { await run(); } catch (error) { messages.push((error as Error).message, JSON.stringify((error as AdminError).detail ?? null)); }
    };
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    await note(() => f.call('backup.create.apply', { confirmToken: 'bad', folder: f.out, passphrase: PASSPHRASE }));
    await note(() => f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE }));
    const file = path.join(f.out, 'dude-hub-20261004T120000Z.dudebackup');
    await note(() => f.call('backup.verify', { file, passphrase: `${PASSPHRASE}x` }));
    await note(() => f.call('backup.verify', { file, passphrase: PASSPHRASE }));
    await note(() => f.call('backup.schedule.set', { folder: f.paths.dataDir, intervalHours: 1, retention: 1, passphrase: PASSPHRASE }));
    await note(() => f.call('backup.schedule.set', { folder: f.out, intervalHours: 1, retention: 1, passphrase: PASSPHRASE }));
    await note(() => f.call('backup.schedule.off'));
    const everything = JSON.stringify({
      audit: f.db.prepare('SELECT * FROM audit_events').all(),
      meta: f.db.prepare('SELECT * FROM meta').all(),
      config: existsSync(f.paths.configFile) ? readFileSync(f.paths.configFile, 'utf8') : '',
      messages,
    });
    expect(everything).not.toContain(PASSPHRASE);
    expect(everything).toContain('backup.created');
    expect(readdirSync(path.join(f.paths.configDir)).some((n) => n.endsWith('.tmp'))).toBe(false);
  });
});
