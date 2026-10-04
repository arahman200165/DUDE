import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openBackup, readBackupHeader } from '@dude/hub-backup';
import type { BackupDeps } from '@dude/hub-backup';
import type { HubDb } from '../db/open-hub-db.js';
import { SECRET_MARKER, cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { BACKUP_CONSEQUENCE_CLASS, createBackupFile } from './create-backup.js';
import type { CreateBackupOptions } from './create-backup.js';

const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const PASSPHRASE = 'a long enough passphrase';

function setup(deps: BackupDeps = cheapDeps()): { options: CreateBackupOptions; root: string; target: string; work: string } {
  const root = tempRoot('create');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.configFile,'{"exposure":{"mode":"private"}}\n');
  const target = path.join(root, 'out', 'nested');
  const work = path.join(root, 'work');
  return {
    root,
    target,
    work,
    options: {
      db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, authorityEpoch: 3, forTransfer: false,
      targetDir: target, credential: { passphrase: PASSPHRASE }, deps, workDir: work,
    },
  };
}

describe('createBackupFile', () => {
  it('writes a verified backup that decrypts to a scrubbed database and the config', async () => {
    const { options, root, target, work } = setup();
    const created = await createBackupFile(options);
    expect(created.file).toBe(path.join(target, 'dude-hub-20261004T120000Z.dudebackup'));
    expect(created.size).toBe(readFileSync(created.file).length);
    expect(created.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(created.manifest.source).toMatchObject({ hubInstanceId: options.hubInstanceId, authorityEpoch: 3 });
    expect(created.manifest.forTransfer).toBe(false);
    expect(created.manifest.hubVersion).toBe('1.2.3');
    expect(created.manifest.counts).toEqual({ devices: 1, records: 1, audit_events: 1, change_feed: 1 });
    expect(created.manifest.files.map((f) => f.name)).toEqual(['dude.db', 'hub.json']);

    expect(readBackupHeader(new Uint8Array(readFileSync(created.file))).kdf.name).toBe('argon2id');
    const opened = await openBackup(new Uint8Array(readFileSync(created.file)), { passphrase: PASSPHRASE }, options.deps);
    expect(new TextDecoder().decode(opened.files.get('hub.json'))).toBe('{"exposure":{"mode":"private"}}\n');
    const dbFile = path.join(root, 'restored.db');
    writeFileSync(dbFile, opened.files.get('dude.db')!);
    const restored = new DatabaseSync(dbFile);
    try {
      expect((restored.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
      expect((restored.prepare('SELECT COUNT(*) AS n FROM devices').get() as { n: number }).n).toBe(1);
    } finally {
      restored.close();
    }
    // The passphrase and the marker never appear in the file; no stray files remain.
    const raw = readFileSync(created.file);
    expect(raw.includes(Buffer.from(PASSPHRASE))).toBe(false);
    expect(raw.includes(Buffer.from(SECRET_MARKER))).toBe(false);
    expect(readdirSync(target)).toEqual(['dude-hub-20261004T120000Z.dudebackup']);
    expect(readdirSync(work)).toEqual([]);
  });

  it('uses an empty object when hub.json is missing and records forTransfer', async () => {
    const { options } = setup();
    rmSync(options.paths.configFile);
    const created = await createBackupFile({ ...options, forTransfer: true });
    const opened = await openBackup(new Uint8Array(readFileSync(created.file)), { passphrase: PASSPHRASE }, options.deps);
    expect(new TextDecoder().decode(opened.files.get('hub.json'))).toBe('{}');
    expect(opened.manifest.forTransfer).toBe(true);
  });

  it('refuses to overwrite an existing backup and leaves it untouched', async () => {
    const { options, target } = setup();
    const first = await createBackupFile(options);
    const before = readFileSync(first.file);
    await expect(createBackupFile(options)).rejects.toThrow(/already exists/);
    expect(readFileSync(first.file).equals(before)).toBe(true);
    expect(readdirSync(target)).toEqual(['dude-hub-20261004T120000Z.dudebackup']);
  });

  it('deletes the file and throws when verification fails', async () => {
    let calls = 0;
    const base = cheapDeps();
    const deps: BackupDeps = {
      ...base,
      // The first derivation (seal) differs from the later one (verify): the written file cannot be opened.
      deriveKey: async (passphrase, salt, params) => {
        calls += 1;
        const key = await base.deriveKey(passphrase, salt, params);
        if (calls > 1) key[0] ^= 0xff;
        return key;
      },
    };
    const { options, target, work } = setup(deps);
    await expect(createBackupFile(options)).rejects.toThrow();
    expect(existsSync(target) ? readdirSync(target) : []).toEqual([]);
    expect(readdirSync(work)).toEqual([]);
  });

  it('leaves nothing behind when sealing fails', async () => {
    const base = cheapDeps();
    const { options, target, work } = setup({ ...base, deriveKey: () => Promise.reject(new Error('kdf down')) });
    await expect(createBackupFile(options)).rejects.toThrow(/kdf down/);
    expect(readdirSync(target)).toEqual([]);
    expect(readdirSync(work)).toEqual([]);
  });

  it('accepts a derived credential (scheduled backups) and exposes the consequence classes', async () => {
    const { options } = setup();
    const { deriveBackupKey } = await import('@dude/hub-backup');
    const derived = await deriveBackupKey(PASSPHRASE, options.deps);
    const created = await createBackupFile({ ...options, credential: { derived } });
    const opened = await openBackup(new Uint8Array(readFileSync(created.file)), { passphrase: PASSPHRASE }, options.deps);
    expect(opened.files.has('dude.db')).toBe(true);
    expect([...BACKUP_CONSEQUENCE_CLASS]).toEqual(['filesystem-write', 'secret-management']);
  });
});
