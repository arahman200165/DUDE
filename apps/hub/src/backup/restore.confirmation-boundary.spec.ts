import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sealBackup } from '@dude/hub-backup';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { startTestHub } from '../server/test-helpers.js';
import { cheapDeps, tempRoot } from './backup-fixture.js';
import {
  RESTORE_CONSEQUENCE_CLASS, RESTORE_PHRASE_OLD_HUB_GONE, RESTORE_PHRASE_REPLACE, RESTORE_TTL_MS, applyRestore, previewRestore, restoreConfirmFile,
} from './restore.js';

/** The Destructive-Action Contract's confirmation-boundary spec for `dude-hub backup restore` (PD-072, PD-074). */
const PASSPHRASE = 'restore boundary passphrase';
const START = Date.parse('2026-10-04T12:00:00Z');
const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function dir(label: string): string {
  const made = tempRoot(label);
  roots.push(made);
  return made;
}

function tree(base: string): string[] {
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .map((entry) => {
      const full = path.join(entry.parentPath, entry.name);
      return `${path.relative(base, full).split(path.sep).join('/')}${entry.isDirectory() ? '/' : `:${statSync(full).size}`}`;
    })
    .sort();
}

async function backupFile(forTransfer = false): Promise<string> {
  const base = dir('boundary-src');
  const paths = hubPaths(base);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error(opened.message);
  const copy = path.join(base, 'copy.db');
  opened.hub.db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  const sourceId = opened.hub.hubInstanceId;
  opened.hub.close();
  const sealed = await sealBackup(
    {
      files: [{ name: 'dude.db', bytes: new Uint8Array(readFileSync(copy)) }, { name: 'hub.json', bytes: new TextEncoder().encode('{}') }],
      hubVersion: '1.0.0',
      source: { hubInstanceId: sourceId, authorityEpoch: 1, schemaVersion: 8, dbMinReaderVersion: 1 },
      forTransfer,
    },
    { passphrase: PASSPHRASE },
    cheapDeps(),
  );
  const file = path.join(base, 'b.dudebackup');
  writeFileSync(file, sealed);
  return file;
}

function existingTarget(): string {
  const base = dir('boundary-target');
  const paths = hubPaths(base);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error(opened.message);
  opened.hub.close();
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.configFile, '{"port":4444}\n');
  return base;
}

function harness() {
  let clock = START;
  return { deps: cheapDeps(() => new Date(clock)), now: () => clock, advance: (ms: number) => { clock += ms; }, newId: () => 'new-id' };
}

describe('backup restore confirmation boundary', () => {
  it('is tagged with the consequence classes and names both typed phrases', () => {
    expect(RESTORE_CONSEQUENCE_CLASS).toEqual(['filesystem-write', 'database-write', 'secret-management']);
    expect(RESTORE_PHRASE_REPLACE).toBe('REPLACE HUB DATA');
    expect(RESTORE_PHRASE_OLD_HUB_GONE).toBe('THE OLD HUB IS GONE');
    expect(RESTORE_TTL_MS).toBe(60_000);
  });

  it('the preview deletes and changes nothing but the staged confirmation file, and stages only a hash of the token', async () => {
    const file = await backupFile();
    const target = existingTarget();
    const before = tree(target);
    const h = harness();
    const preview = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.deps, now: h.now, newToken: () => 'secret-token-value' });
    expect(preview.confirmToken).toBe('secret-token-value');
    expect(preview.summary.consequenceClass).toEqual([...RESTORE_CONSEQUENCE_CLASS]);
    const after = tree(target);
    expect(before.every((entry) => after.includes(entry))).toBe(true);
    expect(after.filter((entry) => !before.includes(entry)).map((entry) => entry.replace(/:\d+$/, ''))).toEqual(['run/', 'run/restore-confirm.json']);
    const staged = readFileSync(restoreConfirmFile(target), 'utf8');
    expect(staged).not.toContain('secret-token-value');
    expect(staged).not.toContain(PASSPHRASE);
    expect(JSON.parse(staged)).toMatchObject({ tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/), expiresAt: START + 60_000 });
  });

  it('an apply without a token, with a forged token or after expiry is refused and changes nothing', async () => {
    const file = await backupFile(true);
    const target = existingTarget();
    const h = harness();
    const common = { file, dataRoot: target, passphrase: PASSPHRASE, deps: h.deps, now: h.now, newId: h.newId, replaceExisting: true, oldHubGoneConfirmed: true };
    const before = tree(target);

    await expect(applyRestore({ ...common, confirmToken: 'never-issued' })).rejects.toMatchObject({ code: 'confirmation-required' });
    expect(tree(target)).toEqual(before);

    const preview = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.deps, now: h.now });
    for (const bad of ['', 'forged', preview.confirmToken.toUpperCase()]) {
      await expect(applyRestore({ ...common, confirmToken: bad })).rejects.toMatchObject({ code: 'confirmation-required' });
    }
    expect(readFileSync(hubPaths(target).configFile, 'utf8')).toBe('{"port":4444}\n');

    const late = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.deps, now: h.now });
    h.advance(RESTORE_TTL_MS + 1);
    await expect(applyRestore({ ...common, confirmToken: late.confirmToken })).rejects.toMatchObject({ code: 'confirmation-required' });
    expect(readFileSync(hubPaths(target).configFile, 'utf8')).toBe('{"port":4444}\n');
    expect(existsSync(hubPaths(target).backupsDir) ? readdirSync(hubPaths(target).backupsDir) : []).toEqual([]);
  });

  it('a valid token is not enough: replacing a Hub and restoring a non-transfer backup each need their own typed confirmation', async () => {
    const file = await backupFile(false);
    const target = existingTarget();
    const h = harness();
    const preview = await previewRestore({ file, passphrase: PASSPHRASE, dataRoot: target, deps: h.deps, now: h.now });
    expect(preview.summary).toMatchObject({ requiresReplacePhrase: true, requiresOldHubGonePhrase: true });
    const common = { file, dataRoot: target, passphrase: PASSPHRASE, deps: h.deps, now: h.now, newId: h.newId, confirmToken: preview.confirmToken };
    const before = tree(target);
    await expect(applyRestore({ ...common, oldHubGoneConfirmed: true })).rejects.toMatchObject({ code: 'target-not-empty' });
    await expect(applyRestore({ ...common, replaceExisting: true })).rejects.toMatchObject({ code: 'old-hub-gone-required' });
    expect(tree(target).filter((entry) => !entry.startsWith('run/'))).toEqual(before.filter((entry) => !entry.startsWith('run/')));
    await expect(applyRestore({ ...common, replaceExisting: true, oldHubGoneConfirmed: true })).resolves.toMatchObject({ authorityEpoch: 2 });
  });

  it('is offline-only: no HTTP route, admin method or credential-bearing server module can issue or consume it', async () => {
    const hub = await startTestHub();
    try {
      expect(hub.app.printRoutes({ commonPrefix: false })).not.toMatch(/restore/i);
    } finally {
      await hub.close();
    }
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const srcRoot = path.resolve(here, '..');
    const offenders: string[] = [];
    for (const sub of ['server', 'auth', 'realtime', 'devices', 'admin', 'security', 'sync']) {
      const folder = path.join(srcRoot, sub);
      if (!existsSync(folder)) continue;
      for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const full = path.join(entry.parentPath, entry.name);
        if (/backup\/restore|applyRestore|previewRestore|RESTORE_PHRASE|restoreConfirmFile/.test(readFileSync(full, 'utf8'))) offenders.push(path.relative(srcRoot, full));
      }
    }
    expect(offenders).toEqual([]);
  });
});
