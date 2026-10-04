import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMeta } from '@dude/sqlite-store';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from '../backup/backup-fixture.js';
import { createBackupFile } from '../backup/create-backup.js';
import { RESTORE_PHRASE_OLD_HUB_GONE, RESTORE_PHRASE_REPLACE } from '../backup/restore.js';
import { BACKUP_PASSPHRASE_ENV } from '../cli/passphrase.js';
import { defaultHubConfig, parseHubConfig, writeHubConfig } from '../config/hub-config.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { getAuthorityEpoch, getAuthorityState } from '../hub/authority.js';
import { runRestore } from './restore.js';
import type { RestoreCommandDeps, RestoreCommandOptions } from './restore.js';
import { fixture } from './test-helpers.js';

/**
 * The restore COMMAND end to end with no fakes for the restore library: a real backup written by `createBackupFile` from a seeded
 * Hub, restored in two steps into a real directory. Only the key derivation is cheap (the injected `backupDeps`) and the running
 * check answers "no Hub" instead of probing a named pipe.
 */
const PASSPHRASE = 'end to end restore passphrase';
const NOW = Date.parse('2026-10-04T12:00:00Z');
const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function makeBackup(forTransfer: boolean): Promise<{ file: string; sourceInstanceId: string }> {
  const base = tempRoot('restore-e2e-src');
  roots.push(base);
  const { hub, paths } = openFixtureHub(base);
  try {
    seedHubDb(hub.db);
    mkdirSync(paths.configDir, { recursive: true });
    writeHubConfig(paths.configFile, defaultHubConfig());
    const created = await createBackupFile({
      db: hub.db, paths, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, authorityEpoch: 3, forTransfer,
      targetDir: path.join(base, 'out'), credential: { passphrase: PASSPHRASE }, deps: cheapDeps(), workDir: path.join(base, 'work'),
    });
    return { file: created.file, sourceInstanceId: hub.hubInstanceId };
  } finally {
    hub.close();
  }
}

function command(target: string) {
  const f = fixture({ state: 'not-installed' });
  const deps: RestoreCommandDeps = {
    ...f.deps,
    env: { ...f.deps.env, [BACKUP_PASSPHRASE_ENV]: PASSPHRASE },
    now: () => NOW,
    isRunning: async () => false,
    backupDeps: cheapDeps(() => new Date(NOW)),
  };
  const run = async (options: Omit<RestoreCommandOptions, 'dataDir'>): Promise<{ code: number; out: string; err: string }> => {
    f.out.length = 0;
    f.err.length = 0;
    const code = await runRestore({ ...options, dataDir: target }, deps);
    return { code, out: f.out.join(''), err: f.err.join('') };
  };
  return run;
}

describe('backup restore end to end (real restore library)', () => {
  it('previews, then restores into an empty directory with a new instance id and the next epoch', async () => {
    const { file, sourceInstanceId } = await makeBackup(false);
    const target = tempRoot('restore-e2e-target');
    roots.push(target);
    const run = command(target);

    const preview = await run({ file });
    expect(preview.code).toBe(0);
    expect(preview.err).toContain(sourceInstanceId);
    expect(preview.err).toContain('authority epoch 3');
    expect(preview.err).toContain('New epoch:  4');
    expect(preview.err).toContain('Every device must be paired again');
    expect(preview.err).toContain('--old-hub-gone "THE OLD HUB IS GONE"');
    expect(preview.err).not.toContain(PASSPHRASE);
    const { confirmToken } = JSON.parse(preview.out) as { confirmToken: string; expiresAt: string };
    expect(confirmToken.length).toBeGreaterThan(20);
    expect(existsSync(hubPaths(target).dbFile)).toBe(false); // the preview changed nothing

    // The backup was not made for transfer: without the phrase the token survives and nothing is restored.
    const refused = await run({ file, confirm: confirmToken });
    expect(refused.code).toBe(1);
    expect(refused.err).toContain('--old-hub-gone "THE OLD HUB IS GONE"');
    expect(existsSync(hubPaths(target).dbFile)).toBe(false);

    const near = await run({ file, confirm: confirmToken, oldHubGone: 'the old hub is gone' });
    expect(near.code).toBe(1);
    expect(existsSync(hubPaths(target).dbFile)).toBe(false);

    const applied = await run({ file, confirm: confirmToken, oldHubGone: RESTORE_PHRASE_OLD_HUB_GONE });
    expect(applied.code).toBe(0);
    const result = JSON.parse(applied.out) as { hubInstanceId: string; authorityEpoch: number; devices: number; replacedDir: string | null };
    expect(result).toMatchObject({ authorityEpoch: 4, devices: 1, replacedDir: null });
    expect(result.hubInstanceId).not.toBe(sourceInstanceId);
    expect(applied.err).toContain('Sign in with the old owner password');
    expect(`${applied.out}${applied.err}`).not.toContain(PASSPHRASE);

    // The restored data root opens as a Hub, with the new identity, the bumped epoch and the owner kept.
    const paths = hubPaths(target);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error(opened.message);
    try {
      expect(opened.hub.hubInstanceId).toBe(result.hubInstanceId);
      expect(opened.hub.hubInstanceId).not.toBe(sourceInstanceId);
      expect(getAuthorityEpoch(opened.hub.db)).toBe(4);
      expect(getAuthorityState(opened.hub.db)).toBe('active');
      expect(getMeta(opened.hub.db, 'hub_instance_id')).toBe(result.hubInstanceId);
      expect(opened.hub.db.prepare('SELECT COUNT(*) AS n FROM owner').get()).toEqual({ n: 1 });
      expect(opened.hub.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
      expect(opened.hub.db.prepare('SELECT needs_re_pair AS n FROM devices WHERE device_id = ?').get('dev-1')).toEqual({ n: 1 });
    } finally {
      opened.hub.close();
    }
    const config = parseHubConfig(JSON.parse(readFileSync(paths.configFile, 'utf8')) as unknown);
    expect(config.exposure.mode).toBe('private');
    expect(existsSync(path.join(paths.dataDir, '.restore-tmp'))).toBe(false);

    // The token is single use.
    const replay = await run({ file, confirm: confirmToken, oldHubGone: RESTORE_PHRASE_OLD_HUB_GONE });
    expect(replay.code).toBe(1);
    expect(replay.err).toContain('without --confirm to get a new token');
  });

  it('replaces an existing Hub only with the exact phrase, moving the old data aside', async () => {
    const { file } = await makeBackup(true);
    const target = tempRoot('restore-e2e-replace');
    roots.push(target);
    const run = command(target);
    const first = JSON.parse((await run({ file })).out) as { confirmToken: string };
    expect((await run({ file, confirm: first.confirmToken })).code).toBe(0); // made for transfer: no old-Hub phrase needed
    const firstInstance = (() => {
      const paths = hubPaths(target);
      const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
      if (opened.status !== 'ready') throw new Error(opened.message);
      const id = opened.hub.hubInstanceId;
      opened.hub.close();
      return id;
    })();

    const preview = await run({ file });
    expect(preview.err).toContain('already contains a Hub');
    expect(preview.err).toContain('--replace "REPLACE HUB DATA"');
    const token = (JSON.parse(preview.out) as { confirmToken: string }).confirmToken;

    const missing = await run({ file, confirm: token });
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('--replace "REPLACE HUB DATA"');
    const near = await run({ file, confirm: token, replace: 'REPLACE HUB DATA ' });
    expect(near.code).toBe(1);

    const applied = await run({ file, confirm: token, replace: RESTORE_PHRASE_REPLACE });
    expect(applied.code).toBe(0);
    const result = JSON.parse(applied.out) as { hubInstanceId: string; replacedDir: string };
    expect(result.hubInstanceId).not.toBe(firstInstance);
    expect(result.replacedDir).toContain(path.join('backups', 'replaced-'));
    expect(readdirSync(result.replacedDir)).toContain('dude.db');
  });
});
