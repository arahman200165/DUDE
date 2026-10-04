import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sealBackup } from '@dude/hub-backup';
import type { BackupDeps } from '@dude/hub-backup';
import { BackupError } from '@dude/hub-backup';
import { getMeta, setMeta } from '@dude/sqlite-store';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import { parseHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { HUB_MIGRATIONS } from '../db/migrations/index.js';
import { getAuthorityEpoch, getAuthorityState } from '../hub/authority.js';
import { SECRET_MARKER, cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { createBackupFile } from './create-backup.js';
import { RESTORE_CONSEQUENCE_CLASS, applyRestore, previewRestore, restoreConfirmFile, sanitizeRestoredConfig } from './restore.js';
import type { ApplyRestoreOptions } from './restore.js';

const PASSPHRASE = 'restore spec passphrase';
const NEW_ID = 'new-hub-instance-id';
const START = Date.parse('2026-10-04T12:00:00Z');
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const root = (label: string): string => {
  const dir = tempRoot(label);
  roots.push(dir);
  return dir;
};

/** Every file under `dir` as `relative/path:size`, sorted. */
function tree(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    out.push(`${path.relative(dir, full).split(path.sep).join('/')}${entry.isDirectory() ? '/' : `:${statSync(full).size}`}`);
  }
  return out.sort();
}

function sourceConfig(base: string): string {
  return JSON.stringify({
    port: 9123,
    bind: 'lan',
    webRoot: path.join(base, 'web'),
    exposure: {
      mode: 'public',
      names: ['hub.example.com', 'hub.lan'],
      canonicalOrigin: 'https://hub.example.com',
      proxy: { trusted: ['10.0.0.1'], publicOrigin: 'https://hub.example.com' },
      acme: { directoryUrl: 'https://acme.example.com/directory' },
    },
    backup: { schedule: { folder: path.join(base, 'sched'), intervalHours: 24, retention: 3 } },
  });
}

function seedExtras(hub: HubDb): void {
  const at = '2026-10-04T10:00:00.000Z';
  hub.db.exec(`
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, revoked_at)
  VALUES ('dev-2', 'env-1', 'Old phone', 'android', '1.0.0', '{}', 0, 1, '${at}', '${at}');
INSERT INTO device_keys(key_id, device_id, algorithm, public_key, created_at, revoked_at) VALUES ('key-2', 'dev-2', 'ed25519', x'ccdd', '${at}', '${at}');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind, installation_id)
  VALUES ('browser-1', 'env-1', 'Browser', 'web', '1.0.0', '[]', 0, 1, '${at}', 'browser', 'inst-1');
INSERT INTO recovery_codes(code_hash, owner_id, generation, created_at) VALUES ('recovery-hash-1', 'owner-1', 1, '${at}');
INSERT INTO tls_pins(spki_sha256, cert_pem, state, created_at) VALUES ('pin-1', 'PEM', 'active', '${at}');
INSERT INTO tls_pin_acks(spki_sha256, device_id, acked_at) VALUES ('pin-1', 'dev-1', '${at}');
INSERT INTO tls_proxy_pins(spki_sha256, state, created_at) VALUES ('proxy-pin-1', 'active', '${at}');
INSERT INTO tls_proxy_pin_acks(spki_sha256, device_id, acked_at) VALUES ('proxy-pin-1', 'dev-1', '${at}');
INSERT INTO device_sync_state(device_id, cursor, updated_at) VALUES ('dev-1', 7, '${at}');
`);
  setMeta(hub.db, 'backup_last', '{"at":"x"}');
  setMeta(hub.db, 'sync_floor', '0');
}

interface Source {
  hub: HubDb;
  paths: HubPaths;
  base: string;
}

function makeSource(label = 'source', migrations?: typeof HUB_MIGRATIONS): Source {
  const base = root(label);
  const paths = hubPaths(base);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir, ...(migrations ? { migrations } : {}) });
  if (opened.status !== 'ready') throw new Error(opened.message);
  hubs.push(opened.hub);
  seedHubDb(opened.hub.db);
  if (migrations === undefined) seedExtras(opened.hub);
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.configFile, sourceConfig(base));
  return { hub: opened.hub, paths, base };
}

/** A backup holding the UNSCRUBBED VACUUM INTO copy, so restore itself must clear every transient row. */
async function sealRaw(source: Source, file: string, options: { forTransfer?: boolean; epoch?: number; deps?: BackupDeps; passphrase?: string } = {}): Promise<void> {
  const copy = path.join(source.base, `raw-${path.basename(file)}.db`);
  source.hub.db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  const bytes = new Uint8Array(readFileSync(copy));
  rmSync(copy, { force: true });
  const sealed = await sealBackup(
    {
      files: [
        { name: 'dude.db', bytes },
        { name: 'hub.json', bytes: new Uint8Array(readFileSync(source.paths.configFile)) },
      ],
      hubVersion: '1.2.3',
      source: {
        hubInstanceId: source.hub.hubInstanceId,
        authorityEpoch: options.epoch ?? 3,
        schemaVersion: Number(getMeta(source.hub.db, 'schema_version')),
        dbMinReaderVersion: Number(getMeta(source.hub.db, 'min_reader_version')),
      },
      forTransfer: options.forTransfer ?? false,
      counts: { devices: 3 },
    },
    { passphrase: options.passphrase ?? PASSPHRASE },
    options.deps ?? cheapDeps(),
  );
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sealed);
}

function clockHarness() {
  let clock = START;
  const base = {
    passphrase: PASSPHRASE,
    deps: cheapDeps(() => new Date(clock)),
    now: () => clock,
    newId: () => NEW_ID,
  };
  return { base, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

async function restore(file: string, dataRoot: string, over: Partial<ApplyRestoreOptions> = {}, previewOver: { token?: string } = {}) {
  const h = clockHarness();
  const preview = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot, deps: h.base.deps, now: h.now, newToken: () => previewOver.token ?? 'tok-1' });
  const apply = (extra: Partial<ApplyRestoreOptions> = {}) => applyRestore({ file, dataRoot, confirmToken: preview.confirmToken, ...h.base, replaceExisting: true, oldHubGoneConfirmed: true, ...over, ...extra });
  return { h, preview, apply };
}

/** A previously running Hub in `dataRoot`, closed, with a TLS directory and a distinctive configuration. */
function makeExistingTarget(label = 'target'): { base: string; paths: HubPaths; dbBytes: Buffer; configText: string } {
  const base = root(label);
  const { hub, paths } = openFixtureHub(base);
  setMeta(hub.db, 'authority_epoch', '9');
  setMeta(hub.db, 'old_marker', 'keep-me-in-replaced');
  hub.close();
  mkdirSync(paths.tlsDir, { recursive: true });
  writeFileSync(path.join(paths.tlsDir, 'leaf.pem'), 'old-tls');
  const configText = '{"port":4444}\n';
  writeFileSync(paths.configFile, configText);
  return { base, paths, dbBytes: readFileSync(paths.dbFile), configText };
}

describe('restore: round trip', () => {
  it('restores into an empty directory with a new identity, a bumped epoch and every transient table cleared', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    // The unscrubbed copy really carries the transient rows, so the assertions below prove restore removed them.
    expect(source.hub.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });

    const target = root('empty');
    const { apply, preview } = await restore(file, target);
    expect(preview.summary).toMatchObject({ targetState: 'empty', newEpoch: 4, forTransfer: false, requiresOldHubGonePhrase: true, requiresReplacePhrase: false });
    expect(preview.summary.source).toMatchObject({ hubInstanceId: source.hub.hubInstanceId, authorityEpoch: 3, hubVersion: '1.2.3' });
    expect(preview.summary.consequenceClass).toEqual(['filesystem-write', 'database-write', 'secret-management']);
    expect(preview.summary.consequenceClass).toEqual([...RESTORE_CONSEQUENCE_CLASS]);

    const result = await apply({ replaceExisting: false });
    expect(result).toEqual({ hubInstanceId: NEW_ID, authorityEpoch: 4, devices: 1, replacedDir: null });

    const paths = hubPaths(target);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error(opened.message);
    hubs.push(opened.hub);
    const db = opened.hub.db;
    // Already at the latest schema: opening ran no migration, so no pre-migration copy exists.
    expect(readdirSync(paths.preMigrationDir)).toEqual([]);
    expect(getMeta(db, 'schema_version')).toBe(String(HUB_MIGRATIONS.length));
    expect(opened.hub.hubInstanceId).toBe(NEW_ID);
    expect(opened.hub.hubInstanceId).not.toBe(source.hub.hubInstanceId);
    expect(getAuthorityEpoch(db)).toBe(4);
    expect(getAuthorityState(db)).toBe('active');

    const count = (table: string): number => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
    for (const table of ['sessions', 'device_tokens', 'challenges', 'pairing_codes', 'setup_state', 'device_sync_state', 'tls_pins', 'tls_pin_acks', 'tls_proxy_pins', 'tls_proxy_pin_acks']) {
      expect([table, count(table)]).toEqual([table, 0]);
    }
    for (const key of ['csrf_key', 'alerts_seen_seq', 'hub_addresses', 'reachability_last', 'acme_last_attempt', 'backup_last', 'revoked_attempt:token:dev-1', 'revoked-attempts:legacy']) {
      expect([key, getMeta(db, key)]).toEqual([key, undefined]);
    }
    expect(getMeta(db, 'sync_floor')).toBe('0');

    // Preserved: owner, credentials, recovery code hashes, throttle, ip_blocks, records, change feed, devices.
    expect(count('owner')).toBe(1);
    expect(count('owner_credentials')).toBe(1);
    expect(count('recovery_codes')).toBe(1);
    expect(count('throttle')).toBe(1);
    expect(count('ip_blocks')).toBe(1);
    expect(count('records')).toBe(1);
    expect(count('change_feed')).toBe(1);
    expect(count('devices')).toBe(3);
    expect(db.prepare("SELECT hash FROM owner_credentials WHERE owner_id = 'owner-1'").get()).toEqual({ hash: new Uint8Array([3, 4]) });

    // Re-pair marks: the active desktop device only; its keys are revoked; revoked devices and browser rows are untouched.
    const rePair = db.prepare('SELECT device_id, needs_re_pair FROM devices ORDER BY device_id').all();
    expect(rePair).toEqual([
      { device_id: 'browser-1', needs_re_pair: 0 },
      { device_id: 'dev-1', needs_re_pair: 1 },
      { device_id: 'dev-2', needs_re_pair: 0 },
    ]);
    const key1 = db.prepare("SELECT revoked_at FROM device_keys WHERE key_id = 'key-1'").get() as { revoked_at: string | null };
    expect(key1.revoked_at).toBe(new Date(START).toISOString());
    expect(db.prepare("SELECT revoked_at FROM device_keys WHERE key_id = 'key-2'").get()).toEqual({ revoked_at: '2026-10-04T10:00:00.000Z' });

    // Audit: history kept plus the two restore events, with counts and booleans only.
    const events = db.prepare('SELECT event, actor_kind, outcome, detail_json FROM audit_events ORDER BY seq').all() as Array<{ event: string; actor_kind: string; outcome: string; detail_json: string | null }>;
    expect(events.map((e) => e.event)).toEqual(['auth.signed-in', 'backup.restore-previewed', 'backup.restored']);
    for (const e of events.slice(1)) {
      expect(e.actor_kind).toBe('cli');
      expect(e.outcome).toBe('success');
      expect(JSON.parse(e.detail_json!)).toEqual({ sourceEpoch: 3, newEpoch: 4, devices: 1, forTransfer: false, replaced: false });
    }
    const everything = JSON.stringify(db.prepare('SELECT * FROM audit_events').all());
    expect(everything).not.toContain(PASSPHRASE);
    expect(everything).not.toContain(SECRET_MARKER);

    // Configuration: loopback-only and private, names and port kept, no proxy, ACME, schedule or machine-specific web root.
    const config = parseHubConfig(JSON.parse(readFileSync(paths.configFile, 'utf8')));
    expect(config).toEqual({ port: 9123, bind: 'loopback', exposure: { mode: 'private', names: ['hub.example.com', 'hub.lan'] } });
    expect(readFileSync(paths.configFile, 'utf8')).not.toMatch(/proxy|acme|backup|webRoot|canonicalOrigin|public/);

    // Layout, and nothing left behind.
    for (const dir of [paths.tlsDir, paths.backupsDir, paths.logsDir, paths.storageDir]) expect(existsSync(dir)).toBe(true);
    expect(existsSync(path.join(paths.dataDir, '.restore-tmp'))).toBe(false);
    expect(existsSync(restoreConfirmFile(target))).toBe(false);
  });

  it('restores a realistic scrubbed backup written by createBackupFile', async () => {
    const source = makeSource();
    const out = path.join(source.base, 'out');
    const created = await createBackupFile({
      db: source.hub.db, paths: source.paths, hubVersion: '1.2.3', hubInstanceId: source.hub.hubInstanceId, authorityEpoch: 3, forTransfer: true,
      targetDir: out, credential: { passphrase: PASSPHRASE }, deps: cheapDeps(), workDir: path.join(source.base, 'work'),
    });
    const target = root('realistic');
    const { apply } = await restore(created.file, target, { oldHubGoneConfirmed: false });
    expect(await apply()).toMatchObject({ authorityEpoch: 4, devices: 1 });
  });

  it('migrates an older backup up to the latest schema', async () => {
    const source = makeSource('older', HUB_MIGRATIONS.slice(0, 7));
    expect(getMeta(source.hub.db, 'schema_version')).toBe('7');
    const file = path.join(source.base, 'out', 'old.dudebackup');
    await sealRaw(source, file);
    const target = root('older-target');
    const { apply } = await restore(file, target);
    await apply();
    const paths = hubPaths(target);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error(opened.message);
    hubs.push(opened.hub);
    expect(getMeta(opened.hub.db, 'schema_version')).toBe('8');
    expect(readdirSync(paths.preMigrationDir)).toEqual([]);
    expect(opened.hub.db.prepare('SELECT device_id, needs_re_pair FROM devices').all()).toEqual([{ device_id: 'dev-1', needs_re_pair: 1 }]);
    expect(opened.hub.db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('pairing_codes') WHERE name = 'reattach_device_id'").get()).toEqual({ n: 1 });
  });

  it('sanitizeRestoredConfig keeps only the port and names', () => {
    const parsed = parseHubConfig(JSON.parse(sourceConfig(tempRoot('cfg'))));
    expect(sanitizeRestoredConfig(parsed)).toEqual({ port: 9123, bind: 'loopback', exposure: { mode: 'private', names: ['hub.example.com', 'hub.lan'] } });
  });
});

describe('restore: refusals leave the target untouched', () => {
  it('refuses a backup whose database needs a newer Hub', async () => {
    const source = makeSource();
    setMeta(source.hub.db, 'min_reader_version', '99');
    const file = path.join(source.base, 'out', 'new.dudebackup');
    await sealRaw(source, file);
    const target = root('too-new');
    const before = tree(target);
    const h = clockHarness();
    await expect(previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.base.deps, now: h.now })).rejects.toMatchObject({ code: 'backup-too-new' });
    expect(tree(target)).toEqual(before);
  });

  it('a wrong passphrase fails cleanly at both steps and changes nothing', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = makeExistingTarget();
    const h = clockHarness();
    await expect(previewRestore({ file, passphrase: 'not the passphrase', dataRoot: target.base, deps: h.base.deps, now: h.now })).rejects.toBeInstanceOf(BackupError);
    expect(existsSync(restoreConfirmFile(target.base))).toBe(false);

    const { apply } = await restore(file, target.base);
    const error = (await apply({ passphrase: 'not the passphrase' }).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(BackupError);
    expect(error.message).not.toContain('not the passphrase');
    expect(readFileSync(target.paths.dbFile)).toEqual(target.dbBytes);
    expect(readFileSync(target.paths.configFile, 'utf8')).toBe(target.configText);
    expect(existsSync(path.join(target.paths.dataDir, '.restore-tmp'))).toBe(false);
  });

  it('refuses a file that is not a backup and a missing file', async () => {
    const target = root('garbage');
    const file = path.join(target, 'junk.dudebackup');
    writeFileSync(file, 'definitely not a backup');
    const h = clockHarness();
    await expect(previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.base.deps, now: h.now })).rejects.toBeInstanceOf(BackupError);
    await expect(previewRestore({ file: path.join(target, 'missing'), passphrase: PASSPHRASE, dataRoot: target, deps: h.base.deps, now: h.now })).rejects.toMatchObject({ code: 'invalid-backup' });
  });

  it('refuses a backup without the database or an invalid configuration', async () => {
    const dir = root('invalid');
    const deps = cheapDeps();
    const seal = (files: Array<{ name: string; bytes: Uint8Array }>) =>
      sealBackup({ files, hubVersion: '1', source: { hubInstanceId: 'x', authorityEpoch: 1, schemaVersion: 8, dbMinReaderVersion: 1 }, forTransfer: true }, { passphrase: PASSPHRASE }, deps);
    const enc = (text: string) => new TextEncoder().encode(text);
    const cases: Array<[string, Array<{ name: string; bytes: Uint8Array }>]> = [
      ['no-db', [{ name: 'hub.json', bytes: enc('{}') }]],
      ['not-sqlite', [{ name: 'dude.db', bytes: enc('nope') }, { name: 'hub.json', bytes: enc('{}') }]],
      ['bad-config', [{ name: 'dude.db', bytes: enc('SQLite format 3\u0000 rest') }, { name: 'hub.json', bytes: enc('{"unknownKey":1}') }]],
    ];
    const h = clockHarness();
    for (const [name, files] of cases) {
      const file = path.join(dir, `${name}.dudebackup`);
      writeFileSync(file, await seal(files));
      await expect(previewRestore({ file, passphrase: PASSPHRASE, dataRoot: path.join(dir, 'target'), deps: h.base.deps, now: h.now })).rejects.toMatchObject({ code: 'invalid-backup' });
    }
    expect(existsSync(path.join(dir, 'target'))).toBe(false);
  });
});

describe('restore: preview and the confirmation token', () => {
  it('the preview writes only the staged confirmation file, with a hashed token and a 60 second expiry', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = makeExistingTarget();
    const before = tree(target.base);
    const { preview, h } = await restore(file, target.base);
    expect(preview.summary.targetState).toBe('existing');
    expect(preview.summary.requiresReplacePhrase).toBe(true);
    const after = tree(target.base);
    expect(after.filter((entry) => !before.includes(entry))).toEqual(['run/', expect.stringMatching(/^run\/restore-confirm\.json:\d+$/)]);
    expect(before.filter((entry) => !after.includes(entry))).toEqual([]);
    const staged = readFileSync(restoreConfirmFile(target.base), 'utf8');
    expect(staged).not.toContain(preview.confirmToken);
    expect(JSON.parse(staged)).toMatchObject({ v: 1, expiresAt: h.now() + 60_000, tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(preview.expiresAt).toBe(new Date(h.now() + 60_000).toISOString());
    expect(readFileSync(target.paths.dbFile)).toEqual(target.dbBytes);
  });

  it('a token is single use: replay, a wrong token and an expired token are all refused', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);

    const replayRoot = root('replay');
    const first = await restore(file, replayRoot);
    await first.apply();
    await expect(first.apply()).rejects.toMatchObject({ code: 'confirmation-required' });

    const wrongRoot = root('wrong-token');
    const wrong = await restore(file, wrongRoot);
    await expect(wrong.apply({ confirmToken: 'forged' })).rejects.toMatchObject({ code: 'confirmation-required' });
    await expect(wrong.apply()).rejects.toMatchObject({ code: 'confirmation-required' }); // the wrong attempt consumed it
    expect(existsSync(hubPaths(wrongRoot).dbFile)).toBe(false);

    const expiredRoot = root('expired');
    const expired = await restore(file, expiredRoot);
    expired.h.advance(60_001);
    await expect(expired.apply()).rejects.toMatchObject({ code: 'confirmation-required' });
    expect(existsSync(hubPaths(expiredRoot).dbFile)).toBe(false);

    await expect(applyRestore({ file, dataRoot: root('no-preview'), confirmToken: 'x', ...clockHarness().base })).rejects.toMatchObject({ code: 'confirmation-required' });
  });

  it('refuses when the file changed since the preview', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = root('file-changed');
    const { apply } = await restore(file, target);
    setMeta(source.hub.db, 'extra', '1');
    await sealRaw(source, file, { epoch: 5 });
    await expect(apply()).rejects.toMatchObject({ code: 'conflict' });
    expect(existsSync(hubPaths(target).dbFile)).toBe(false);
  });

  it('refuses when the target changed since the preview', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = root('target-changed');
    const { apply } = await restore(file, target);
    mkdirSync(hubPaths(target).dataDir, { recursive: true });
    writeFileSync(hubPaths(target).dbFile, 'a hub appeared');
    await expect(apply()).rejects.toMatchObject({ code: 'conflict' });
    expect(readFileSync(hubPaths(target).dbFile, 'utf8')).toBe('a hub appeared');
  });
});

describe('restore: phrases and the existing target', () => {
  it('an existing target needs replaceExisting and then moves the old files aside, byte for byte', async () => {
    const source = makeSource();
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = makeExistingTarget();
    const { apply } = await restore(file, target.base);
    await expect(apply({ replaceExisting: false })).rejects.toMatchObject({ code: 'target-not-empty' });
    expect(readFileSync(target.paths.dbFile)).toEqual(target.dbBytes);

    const result = await apply(); // the token survives a missing phrase
    expect(result.replacedDir).not.toBeNull();
    expect(path.dirname(result.replacedDir!)).toBe(target.paths.backupsDir);
    expect(path.basename(result.replacedDir!)).toBe('replaced-20261004T120000Z');
    expect(readFileSync(path.join(result.replacedDir!, 'dude.db'))).toEqual(target.dbBytes);
    expect(readFileSync(path.join(result.replacedDir!, 'hub.json'), 'utf8')).toBe(target.configText);
    expect(readFileSync(path.join(result.replacedDir!, 'tls', 'leaf.pem'), 'utf8')).toBe('old-tls');

    const opened = openHubDb({ dbFile: target.paths.dbFile, preMigrationDir: target.paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error(opened.message);
    hubs.push(opened.hub);
    expect(getMeta(opened.hub.db, 'old_marker')).toBeUndefined();
    expect(getAuthorityEpoch(opened.hub.db)).toBe(4);
    expect(existsSync(path.join(target.paths.tlsDir, 'leaf.pem'))).toBe(false);
    const replacedFlags = opened.hub.db.prepare("SELECT detail_json FROM audit_events WHERE event LIKE 'backup.restore%' ORDER BY seq").all() as Array<{ detail_json: string }>;
    expect(replacedFlags.map((r) => JSON.parse(r.detail_json).replaced)).toEqual([true, true]);
  });

  it('a backup that was not made for transfer needs the old-Hub-gone confirmation; a transfer backup does not', async () => {
    const source = makeSource();
    const plain = path.join(source.base, 'out', 'plain.dudebackup');
    const transfer = path.join(source.base, 'out', 'transfer.dudebackup');
    await sealRaw(source, plain);
    await sealRaw(source, transfer, { forTransfer: true });

    const a = root('not-transfer');
    const refused = await restore(plain, a);
    await expect(refused.apply({ oldHubGoneConfirmed: false })).rejects.toMatchObject({ code: 'old-hub-gone-required' });
    expect(existsSync(hubPaths(a).dbFile)).toBe(false);
    await refused.apply(); // token kept: now with the confirmation

    const b = root('transfer');
    const viaTransfer = await restore(transfer, b);
    expect(viaTransfer.preview.summary).toMatchObject({ forTransfer: true, requiresOldHubGonePhrase: false });
    await expect(viaTransfer.apply({ oldHubGoneConfirmed: false })).resolves.toMatchObject({ authorityEpoch: 4 });
  });
});

describe('restore: failures leave the original data intact', () => {
  async function failing(label: string, over: (target: ReturnType<typeof makeExistingTarget>) => Partial<ApplyRestoreOptions>) {
    const source = makeSource(`${label}-src`);
    const file = path.join(source.base, 'out', 'b.dudebackup');
    await sealRaw(source, file);
    const target = makeExistingTarget(label);
    const { apply } = await restore(file, target.base);
    await expect(apply(over(target))).rejects.toThrow();
    expect(readFileSync(target.paths.dbFile)).toEqual(target.dbBytes);
    expect(readFileSync(target.paths.configFile, 'utf8')).toBe(target.configText);
    expect(readFileSync(path.join(target.paths.tlsDir, 'leaf.pem'), 'utf8')).toBe('old-tls');
    expect(existsSync(path.join(target.paths.dataDir, '.restore-tmp'))).toBe(false);
    expect(existsSync(restoreConfirmFile(target.base))).toBe(false); // the token is spent either way
    return target;
  }

  it('a failure while building the new database changes nothing', async () => {
    const target = await failing('build-fails', () => ({ newId: () => { throw new Error('randomness failed'); } }));
    expect(existsSync(target.paths.backupsDir) ? readdirSync(target.paths.backupsDir) : []).toEqual([]);
  });

  it('an unwritable replaced-files folder changes nothing', async () => {
    await failing('unwritable', (target) => {
      rmSync(target.paths.backupsDir, { recursive: true, force: true });
      writeFileSync(target.paths.backupsDir, 'a file where the folder should be');
      return {};
    });
  });

  it('a failure in the final moves rolls every move back', async () => {
    const target = await failing('rename-fails', (t) => ({
      rename: (from, to) => {
        if (to === t.paths.configFile) throw new Error('disk full');
        renameSync(from, to);
      },
    }));
    expect(readdirSync(target.paths.backupsDir)).toEqual([]);
    expect(readdirSync(target.paths.dataDir).filter((name) => name.startsWith('dude.db'))).toEqual(['dude.db']);
  });
});
