import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminError } from '../admin/admin-endpoint.js';
import { BACKUP_CREATE_ACTION, BACKUP_REACTIVATE_ACTION } from '../admin/backup-methods.js';
import { buildAdminMethods } from '../admin/methods.js';
import { getAuthorityEpoch, getAuthorityState, setAuthority } from '../hub/authority.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { startTestHub } from '../server/test-helpers.js';
import type { HubDb } from '../db/open-hub-db.js';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from './backup-fixture.js';
import { BACKUP_REACTIVATE_CONSEQUENCE_CLASS, BACKUP_TRANSFER_CONSEQUENCE_CLASS } from './create-backup.js';

/** The Destructive-Action Contract's confirmation-boundary spec for `dude-hub backup create --for-transfer` and `backup reactivate` (PD-071, PD-074). */
const PASSPHRASE = 'boundary spec passphrase';
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = tempRoot('transfer-boundary');
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
  const fail = async (method: string, params: unknown): Promise<AdminError> => {
    try { await methods[method]!(params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  const staged = (): Map<string, unknown> => (confirmations as unknown as { staged: Map<string, unknown> }).staged;
  return { root, hub, paths, methods, confirmations, staged, fail, out: path.join(root, 'out'), now: () => clock, advance: (ms: number) => { clock += ms; } };
}

const written = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder) : []);

describe('backup create --for-transfer confirmation boundary', () => {
  it('tags the consequence class and changes nothing on a preview: still active, no file', async () => {
    const f = fixture();
    const preview = (await f.methods['backup.create.preview']!({ folder: f.out, forTransfer: true })) as { consequenceClass: string[] };
    expect(preview.consequenceClass).toEqual(['filesystem-write', 'secret-management', 'system-config']);
    expect(preview.consequenceClass).toEqual([...BACKUP_TRANSFER_CONSEQUENCE_CLASS]);
    expect(getAuthorityState(f.hub.db)).toBe('active');
    expect(getAuthorityEpoch(f.hub.db)).toBe(3);
    expect(existsSync(f.out)).toBe(false);
    expect(written(f.paths.backupsDir)).toEqual([]);
    expect(f.hub.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event IN ('backup.created', 'backup.failed', 'backup.transferred')").get()).toEqual({ n: 0 });
  });

  it('keeps only the hash of a token; it is single-use and expires after 60 seconds', async () => {
    const f = fixture();
    const { confirmToken } = (await f.methods['backup.create.preview']!({ folder: f.out, forTransfer: true })) as { confirmToken: string };
    const stored = [...f.staged().keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]).not.toBe(confirmToken);
    expect(JSON.stringify([...f.staged().values()])).not.toContain(confirmToken);
    expect(CONFIRMATION_TTL_MS).toBe(60_000);

    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE, forTransfer: true })).code).toBe('confirmation-required');
    expect(getAuthorityState(f.hub.db)).toBe('active');
    expect(written(f.out)).toEqual([]);

    const fresh = ((await f.methods['backup.create.preview']!({ folder: f.out, forTransfer: true })) as { confirmToken: string }).confirmToken;
    f.advance(CONFIRMATION_TTL_MS - 1);
    expect(await f.methods['backup.create.apply']!({ confirmToken: fresh, folder: f.out, passphrase: PASSPHRASE, forTransfer: true })).toMatchObject({ retired: true });
    expect(getAuthorityState(f.hub.db)).toBe('transferred');
    f.advance(1000);
    // A replay changes nothing: the token is spent (and a retired Hub cannot transfer again).
    const replay = await f.fail('backup.create.apply', { confirmToken: fresh, folder: f.out, passphrase: PASSPHRASE, forTransfer: true });
    expect(['confirmation-required', 'conflict']).toContain(replay.code);
    expect(written(f.out)).toHaveLength(1);
  });

  it('refuses an apply without a token, with an empty token or with one that was never issued: the Hub stays active', async () => {
    const f = fixture();
    for (const confirmToken of [undefined, '', 'forged', 42]) {
      const err = await f.fail('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE, forTransfer: true });
      expect(['bad-request', 'confirmation-required']).toContain(err.code);
    }
    expect(written(f.out)).toEqual([]);
    expect(getAuthorityState(f.hub.db)).toBe('active');
  });

  it('a plain-backup token cannot retire the Hub, and a transfer token cannot make a plain backup', async () => {
    const f = fixture();
    const plain = ((await f.methods['backup.create.preview']!({ folder: f.out })) as { confirmToken: string }).confirmToken;
    expect((await f.fail('backup.create.apply', { confirmToken: plain, folder: f.out, passphrase: PASSPHRASE, forTransfer: true })).code).toBe('conflict');
    const transfer = ((await f.methods['backup.create.preview']!({ folder: f.out, forTransfer: true })) as { confirmToken: string }).confirmToken;
    expect((await f.fail('backup.create.apply', { confirmToken: transfer, folder: f.out, passphrase: PASSPHRASE })).code).toBe('conflict');
    const wrongAction = f.confirmations.issue({ action: BACKUP_REACTIVATE_ACTION, digest: 'x', bindingId: 'cli', now: f.now() });
    expect((await f.fail('backup.create.apply', { confirmToken: wrongAction, folder: f.out, passphrase: PASSPHRASE, forTransfer: true })).code).toBe('confirmation-required');
    expect(written(f.out)).toEqual([]);
    expect(getAuthorityState(f.hub.db)).toBe('active');
  });
});

describe('backup reactivate confirmation boundary', () => {
  const retire = (f: ReturnType<typeof fixture>): void => setAuthority(f.hub.db, { epoch: 3, state: 'transferred' });

  it('tags the consequence class and changes nothing on a preview: still transferred, same epoch', async () => {
    const f = fixture();
    retire(f);
    const preview = (await f.methods['backup.reactivate.preview']!({})) as { consequenceClass: string[] };
    expect(preview.consequenceClass).toEqual([...BACKUP_REACTIVATE_CONSEQUENCE_CLASS]);
    expect(preview.consequenceClass).toContain('system-config');
    expect(getAuthorityState(f.hub.db)).toBe('transferred');
    expect(getAuthorityEpoch(f.hub.db)).toBe(3);
    expect(f.hub.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event = 'backup.reactivated'").get()).toEqual({ n: 0 });
  });

  it('keeps only the hash of a token; it is single-use and expires after 60 seconds', async () => {
    const f = fixture();
    retire(f);
    const { confirmToken } = (await f.methods['backup.reactivate.preview']!({})) as { confirmToken: string };
    const stored = [...f.staged().keys()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]).not.toBe(confirmToken);

    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.reactivate.apply', { confirmToken })).code).toBe('confirmation-required');
    expect(getAuthorityState(f.hub.db)).toBe('transferred');

    const fresh = ((await f.methods['backup.reactivate.preview']!({})) as { confirmToken: string }).confirmToken;
    expect(await f.methods['backup.reactivate.apply']!({ confirmToken: fresh })).toEqual({ authorityEpoch: 4, authorityState: 'active' });
    expect((await f.fail('backup.reactivate.apply', { confirmToken: fresh })).code).toBe('confirmation-required');
    expect(getAuthorityEpoch(f.hub.db)).toBe(4);
  });

  it('refuses an apply without a token or with a token of another action', async () => {
    const f = fixture();
    retire(f);
    for (const confirmToken of [undefined, '', 'forged', 42]) {
      expect(['bad-request', 'confirmation-required']).toContain((await f.fail('backup.reactivate.apply', { confirmToken })).code);
    }
    const other = f.confirmations.issue({ action: BACKUP_CREATE_ACTION, digest: 'x', bindingId: 'cli', now: f.now() });
    expect((await f.fail('backup.reactivate.apply', { confirmToken: other })).code).toBe('confirmation-required');
    expect(getAuthorityState(f.hub.db)).toBe('transferred');
    expect(getAuthorityEpoch(f.hub.db)).toBe(3);
  });
});

describe('transfer and reactivate are reachable only over the admin pipe', () => {
  it('no HTTP route, sync credential or web credential can issue or consume either action', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      expect(routes).not.toMatch(/backup|transfer|reactivate/i);
    } finally {
      await hub.close();
    }
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const srcRoot = path.resolve(here, '..');
    const offenders: string[] = [];
    for (const dir of ['server', 'auth', 'realtime', 'devices', 'security']) {
      for (const entry of readdirSync(path.join(srcRoot, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || /\.spec\.ts$/.test(entry.name) || entry.name === 'test-helpers.ts') continue;
        const file = path.join(entry.parentPath, entry.name);
        if (/BACKUP_(?:CREATE|REACTIVATE)_ACTION|['"]backup\.(?:create|reactivate)|admin\/backup-methods|setAuthority\(/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
