import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openRepository, readRepositoryObject } from '@dude/hub-backup';
import { loadOrCreateHubConfig } from '../config/hub-config.js';
import { CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { startTestHub } from '../server/test-helpers.js';
import { openV2AdminFixture, V2_PASSPHRASE } from './backup-v2-admin-fixture.js';
import { destinationLockKey, tryLockDestination } from './destination-lock.js';
import { createLocalFolderDestination } from './destinations/local-folder.js';

/**
 * Destructive-Action Contract for the backup v2 admin actions (Milestone 847): `backup prune` (deletes backups and packs at a
 * destination), `backup rewrap` (replaces every destination's `repo`, so the old passphrase stops working) and `backup destination
 * remove` (forgets a destination and, for the last one, deletes the master key). Each is a preview that changes nothing and stages a
 * single-use 60-second ConfirmationStore token bound to what was previewed, an apply that spends it, a `ConsequenceClass` tag, and
 * the admin pipe as the only caller. Registered in the high-consequence gate by its file name.
 */
const fixtures: Array<ReturnType<typeof openV2AdminFixture>> = [];
afterEach(() => { for (const f of fixtures.splice(0)) f.close(); });

async function withTwoBackups(label: string) {
  const f = openV2AdminFixture(label);
  fixtures.push(f);
  await f.ss.add(new Uint8Array(randomBytes(24 * 1024)), 'doc');
  const id = (await f.call('backup.destination.add', { folder: f.folder('one'), passphrase: V2_PASSPHRASE })).destination.id as string;
  const first = (await f.call('backup.run')).results[0].backupId as string;
  f.advance(3_600_000); // the same UTC day: the daily rule keeps only the newer one
  const second = (await f.call('backup.run')).results[0].backupId as string;
  const objects = (): string[] => {
    const out: string[] = [];
    for (const sub of ['packs', 'manifests']) if (existsSync(path.join(f.folder('one'), sub))) for (const n of readdirSync(path.join(f.folder('one'), sub))) out.push(`${sub}/${n}`);
    return out.sort();
  };
  return { f, id, first, second, objects };
}

describe('backup prune confirmation boundary', () => {
  it('tags the consequence class and deletes nothing on a preview; the apply deletes exactly the previewed plan', async () => {
    const { f, id, first, second, objects } = await withTwoBackups('prune-preview');
    const before = objects();
    const preview = await f.call('backup.prune.preview', { destination: id });
    expect(preview.consequenceClass).toEqual(['filesystem-write']);
    expect(preview.summary).toMatchObject({ destination: id, policy: { daily: 7, weekly: 4, monthly: 6 }, keep: [second], deleteBackups: [first] });
    expect(objects()).toEqual(before);
    expect(f.auditRows().some((r) => r.event === 'backup.v2-pruned')).toBe(false);

    const applied = await f.call('backup.prune.apply', { destination: id, confirmToken: preview.confirmToken });
    expect(applied).toMatchObject({ destination: id, manifests: 1, packs: preview.summary.sweepPacks, kept: 1 });
    expect(objects()).not.toContain(`manifests/${first}`);
    expect(objects()).toContain(`manifests/${second}`);
    expect(JSON.parse(f.auditRows().find((r) => r.event === 'backup.v2-pruned')!.detail_json!)).toMatchObject({ destination: id, manifests: 1 });
    // The retained backup still verifies end to end.
    expect(await f.call('backup.destination.verify', { id })).toMatchObject({ ok: true, backupId: second });
  });

  it('the token is single-use, expires after 60 seconds, is bound to its action and refuses a missing or forged value', async () => {
    const { f, id, objects } = await withTwoBackups('prune-token');
    const before = objects();
    expect((await f.fail('backup.prune.apply', { destination: id })).code).toBe('bad-request');
    expect((await f.fail('backup.prune.apply', { destination: id, confirmToken: 'forged' })).code).toBe('confirmation-required');
    const rewrapToken = (await f.call('backup.rewrap.preview')).confirmToken;
    expect((await f.fail('backup.prune.apply', { destination: id, confirmToken: rewrapToken })).code).toBe('confirmation-required');
    const stale = (await f.call('backup.prune.preview', { destination: id })).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.prune.apply', { destination: id, confirmToken: stale })).code).toBe('confirmation-required');
    expect(objects()).toEqual(before);

    const fresh = (await f.call('backup.prune.preview', { destination: id })).confirmToken;
    await f.call('backup.prune.apply', { destination: id, confirmToken: fresh });
    expect((await f.fail('backup.prune.apply', { destination: id, confirmToken: fresh })).code).toBe('confirmation-required');
  });

  it('is bound to the previewed plan: a backup taken after the preview makes the apply a conflict and deletes nothing', async () => {
    const { f, id, objects } = await withTwoBackups('prune-bound');
    const { confirmToken } = await f.call('backup.prune.preview', { destination: id });
    f.advance(10_000); // within the token's 60 seconds
    await f.call('backup.run');
    const before = objects();
    expect((await f.fail('backup.prune.apply', { destination: id, confirmToken })).code).toBe('conflict');
    expect(objects()).toEqual(before);
  });

  it('never runs while a backup holds the destination; the refused apply keeps the token valid', async () => {
    const { f, id, first, objects } = await withTwoBackups('prune-lock');
    const { confirmToken } = await f.call('backup.prune.preview', { destination: id });
    const lock = tryLockDestination(destinationLockKey(f.paths.root, id), 'backup');
    if (!('release' in lock)) throw new Error('lock expected');
    const refused = await f.fail('backup.prune.apply', { destination: id, confirmToken });
    expect(refused.code).toBe('conflict');
    expect(refused.message).toMatch(/backup/);
    expect(objects()).toContain(`manifests/${first}`);
    lock.release();
    await f.call('backup.prune.apply', { destination: id, confirmToken });
    expect(objects()).not.toContain(`manifests/${first}`);
  });
});

describe('backup rewrap confirmation boundary', () => {
  it('tags the classes, changes nothing on a preview, needs the token and a valid passphrase, then only the new passphrase opens', async () => {
    const { f, objects } = await withTwoBackups('rewrap');
    const repoFile = path.join(f.folder('one'), 'repo');
    const repoBefore = readFileSync(repoFile);
    const packsBefore = objects().filter((o) => o.startsWith('packs/')).map((o) => createHash('sha256').update(readFileSync(path.join(f.folder('one'), ...o.split('/')))).digest('hex'));
    const preview = await f.call('backup.rewrap.preview');
    expect(preview.consequenceClass).toEqual(['secret-management', 'filesystem-write']);
    expect(readFileSync(repoFile)).toEqual(repoBefore);

    const NEW = 'a brand new backup passphrase';
    expect((await f.fail('backup.rewrap.apply', { passphrase: NEW })).code).toBe('bad-request');
    expect((await f.fail('backup.rewrap.apply', { confirmToken: 'forged', passphrase: NEW })).code).toBe('confirmation-required');
    // A rejected passphrase does not spend the token.
    const short = await f.fail('backup.rewrap.apply', { confirmToken: preview.confirmToken, passphrase: 'short' });
    expect(short.code).toBe('bad-request');
    expect(readFileSync(repoFile)).toEqual(repoBefore);
    const result = await f.call('backup.rewrap.apply', { confirmToken: preview.confirmToken, passphrase: NEW });
    expect(result.ok).toBe(true);
    expect((await f.fail('backup.rewrap.apply', { confirmToken: preview.confirmToken, passphrase: NEW })).code).toBe('confirmation-required');

    const source = createLocalFolderDestination({ id: 'x', label: 'x', folder: f.folder('one') }).source();
    await expect(openRepository(await readRepositoryObject(source), { passphrase: V2_PASSPHRASE }, f.deps)).rejects.toMatchObject({ code: 'wrong-passphrase-or-corrupt' });
    const reopened = await openRepository(await readRepositoryObject(source), { passphrase: NEW }, f.deps);
    expect(reopened.exportMasterKey()).toEqual(f.keys.key());
    reopened.close();
    const packsAfter = objects().filter((o) => o.startsWith('packs/')).map((o) => createHash('sha256').update(readFileSync(path.join(f.folder('one'), ...o.split('/')))).digest('hex'));
    expect(packsAfter).toEqual(packsBefore);
    expect(JSON.parse(f.auditRows().find((r) => r.event === 'backup.rewrapped')!.detail_json!)).toEqual({ destinations: 1, failed: 0 });
    expect(JSON.stringify(f.auditRows())).not.toContain(NEW);
  });
});

describe('backup destination remove confirmation boundary', () => {
  it('tags the classes, changes nothing on a preview, and the apply forgets the destination but never deletes its backups', async () => {
    const { f, id, objects } = await withTwoBackups('remove');
    await f.call('backup.schedule.set', { intervalHours: 24 });
    const before = objects();
    const preview = await f.call('backup.destination.remove.preview', { id });
    expect(preview.consequenceClass).toEqual(['system-config', 'secret-management']);
    expect(preview.summary).toMatchObject({ id, last: true, removesMasterKey: true, turnsOffSchedule: true });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup?.destinations).toHaveLength(1);
    expect(f.keys.key()).not.toBeNull();

    expect((await f.fail('backup.destination.remove.apply', { id })).code).toBe('bad-request');
    expect((await f.fail('backup.destination.remove.apply', { id, confirmToken: 'forged' })).code).toBe('confirmation-required');
    const lock = tryLockDestination(destinationLockKey(f.paths.root, id), 'backup');
    if (!('release' in lock)) throw new Error('lock expected');
    expect((await f.fail('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken })).code).toBe('conflict');
    lock.release();

    const removed = await f.call('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken });
    expect(removed).toEqual({ removed: true, id, last: true, keyRemoved: true, scheduleOff: true });
    expect(loadOrCreateHubConfig(f.paths.configFile).backup).toBeUndefined();
    expect(f.keys.key()).toBeNull();
    expect(objects()).toEqual(before);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'backup_dest%'").get()).toEqual({ n: 0 });
    expect(JSON.parse(f.auditRows().find((r) => r.event === 'backup.destination-removed')!.detail_json!)).toEqual({ destination: id, kind: 'local-folder', last: true, unattendedCleared: true });
    expect((await f.fail('backup.destination.remove.apply', { id, confirmToken: preview.confirmToken })).code).toBe('not-found');
  });
});

describe('the backup v2 actions are reachable only over the admin pipe', () => {
  it('no HTTP route and no credential-bearing server module can issue or consume prune, rewrap or destination tokens', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      expect(routes.replace(/\/api\/v1\/backup\/(?:status|drive\/callback) \(GET, HEAD\)/g, '')).not.toMatch(/backup/i);
    } finally {
      await hub.close();
    }
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const srcRoot = path.resolve(here, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices', 'security', 'sync']) {
      if (!existsSync(path.join(srcRoot, dir))) continue;
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/['"]backup\.(?:prune|rewrap|destination|run)|BACKUP_(?:PRUNE|REWRAP|DESTINATION_REMOVE)_ACTION|master-key|run-backup-v2|retention-v2/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
