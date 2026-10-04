import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminError } from '../admin/admin-endpoint.js';
import { BACKUP_CREATE_ACTION } from '../admin/backup-methods.js';
import { buildAdminMethods } from '../admin/methods.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { startTestHub } from '../server/test-helpers.js';
import type { HubDb } from '../db/open-hub-db.js';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { BACKUP_CONSEQUENCE_CLASS } from './create-backup.js';

/** The Destructive-Action Contract's confirmation-boundary spec for `dude-hub backup create` (PD-074). */
const PASSPHRASE = 'boundary spec passphrase';
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = tempRoot('boundary');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db);
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const confirmations = new ConfirmationStore();
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: 't', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0, configDir: paths.configDir,
    spkiSha256: 'S'.repeat(43), paths, backupDeps: cheapDeps(() => new Date(clock)), now: () => clock, confirmations,
  });
  const out = path.join(root, 'out');
  const apply = async (params: unknown): Promise<AdminError> => {
    try { await methods['backup.create.apply']!(params); } catch (error) { return error as AdminError; }
    throw new Error('apply did not fail');
  };
  return { root, hub, paths, methods, confirmations, out, apply, now: () => clock, advance: (ms: number) => { clock += ms; } };
}

const written = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder) : []);

describe('backup create confirmation boundary', () => {
  it('tags the consequence class and writes nothing on a preview', async () => {
    const f = fixture();
    const preview = (await f.methods['backup.create.preview']!({ folder: f.out })) as { consequenceClass: string[]; confirmToken: string };
    expect(preview.consequenceClass).toEqual(['filesystem-write', 'secret-management']);
    expect(preview.consequenceClass).toEqual([...BACKUP_CONSEQUENCE_CLASS]);
    expect(existsSync(f.out)).toBe(false);
    expect(written(f.paths.backupsDir)).toEqual([]);
    expect(f.hub.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event IN ('backup.created', 'backup.failed')").get()).toEqual({ n: 0 });
  });

  it('keeps only the hash of a token, and it is single-use and expires after 60 seconds', async () => {
    const f = fixture();
    const { confirmToken } = (await f.methods['backup.create.preview']!({ folder: f.out })) as { confirmToken: string };
    const stored = [...(f.confirmations as unknown as { staged: Map<string, unknown> }).staged.keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]).not.toBe(confirmToken);
    expect(JSON.stringify([...(f.confirmations as unknown as { staged: Map<string, unknown> }).staged.values()])).not.toContain(confirmToken);
    expect(CONFIRMATION_TTL_MS).toBe(60_000);

    const expired = confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.apply({ confirmToken: expired, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required');
    expect(written(f.out)).toEqual([]);

    const fresh = ((await f.methods['backup.create.preview']!({ folder: f.out })) as { confirmToken: string }).confirmToken;
    f.advance(CONFIRMATION_TTL_MS - 1);
    expect(await f.methods['backup.create.apply']!({ confirmToken: fresh, folder: f.out, passphrase: PASSPHRASE })).toMatchObject({ size: expect.any(Number) });
    expect(written(f.out)).toHaveLength(1);
    f.advance(1000);
    expect((await f.apply({ confirmToken: fresh, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required'); // replay
    expect(written(f.out)).toHaveLength(1);
  });

  it('refuses an apply without a token, with an empty token or with a token that was never issued', async () => {
    const f = fixture();
    for (const confirmToken of [undefined, '', 'forged', 42]) {
      const err = await f.apply({ confirmToken, folder: f.out, passphrase: PASSPHRASE });
      expect(['bad-request', 'confirmation-required']).toContain(err.code);
    }
    expect(written(f.out)).toEqual([]);
    expect(f.hub.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event = 'backup.created'").get()).toEqual({ n: 0 });
  });

  it('refuses a token issued for another action or another binding', async () => {
    const f = fixture();
    const other = f.confirmations.issue({ action: 'owner.reset', digest: 'x', bindingId: 'cli', now: f.now() });
    expect((await f.apply({ confirmToken: other, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required');
    const wrongBinding = f.confirmations.issue({ action: BACKUP_CREATE_ACTION, digest: 'x', bindingId: 'session-hash', now: f.now() });
    expect((await f.apply({ confirmToken: wrongBinding, folder: f.out, passphrase: PASSPHRASE })).code).toBe('confirmation-required');
    // And a backup token cannot drive the owner reset.
    const backupToken = ((await f.methods['backup.create.preview']!({ folder: f.out })) as { confirmToken: string }).confirmToken;
    await expect((async () => f.methods['owner.reset.apply']!({ confirmToken: backupToken }))()).rejects.toMatchObject({ code: expect.stringMatching(/not-bootstrapped|confirmation-required/) });
    expect(written(f.out)).toEqual([]);
  });

  it('binds the token to the previewed folder and the Hub identity', async () => {
    const f = fixture();
    const { confirmToken } = (await f.methods['backup.create.preview']!({ folder: f.out })) as { confirmToken: string };
    const err = await f.apply({ confirmToken, folder: path.join(f.root, 'other'), passphrase: PASSPHRASE });
    expect(err.code).toBe('conflict');
    expect(written(path.join(f.root, 'other'))).toEqual([]);
    expect(written(f.out)).toEqual([]);
  });

  it('is reachable only over the admin pipe: no HTTP route, sync credential or web credential can issue or consume it', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      // The only backup route is the owner's read-only status model (GET); nothing can create a backup or issue/consume a token.
      expect(routes).toContain('/api/v1/backup/status (GET, HEAD)');
      expect(routes.replace('/api/v1/backup/status (GET, HEAD)', '')).not.toMatch(/backup/i);
    } finally {
      await hub.close();
    }
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const srcRoot = path.resolve(here, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices']) {
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/BACKUP_CREATE_ACTION|['"]backup\.create|admin\/backup-methods|['"](?:\.\.\/)+backup\//.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
