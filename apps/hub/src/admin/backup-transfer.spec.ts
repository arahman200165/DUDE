import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openBackup } from '@dude/hub-backup';
import { getMeta } from '@dude/sqlite-store';
import { cheapDeps, openFixtureHub, seedHubDb, tempRoot } from '../backup/backup-fixture.js';
import { BACKUP_TRANSFER_CONSEQUENCE_CLASS } from '../backup/create-backup.js';
import type { HubDb } from '../db/open-hub-db.js';
import { getAuthorityEpoch, getAuthorityState, setAuthority } from '../hub/authority.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';

const PASSPHRASE = 'Tr0ub4dor-and-correct-horse-PASSMARK';
const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = tempRoot('transfer');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  seedHubDb(hub.db); // epoch 3
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const onTransferred = vi.fn();
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43), paths,
    backupDeps: cheapDeps(() => new Date(clock)), now: () => clock, confirmations: new ConfirmationStore(), onTransferred,
  });
  const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);
  const fail = async (method: string, params: unknown = {}): Promise<AdminError> => {
    try { await call(method, params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  return { root, hub, paths, db: hub.db, call, fail, onTransferred, out: path.join(root, 'out'), advance: (ms: number) => { clock += ms; } };
}

const auditRows = (db: HubDb['db']): Array<{ event: string; outcome: string; detail_json: string | null }> =>
  db.prepare('SELECT event, outcome, detail_json FROM audit_events ORDER BY seq').all() as never;

describe('backup create --for-transfer', () => {
  it('previews the retirement without changing anything', async () => {
    const f = fixture();
    const preview = await f.call('backup.create.preview', { folder: f.out, forTransfer: true });
    expect(preview.consequenceClass).toEqual([...BACKUP_TRANSFER_CONSEQUENCE_CLASS]);
    expect(preview.consequenceClass).toEqual(['filesystem-write', 'secret-management', 'system-config']);
    expect(preview.summary).toMatchObject({ forTransfer: true, retiresThisHub: true, authorityEpoch: 3 });
    expect(preview.summary.retireWarning).toMatch(/refuse sign-in, sync, pairing and web access/);
    expect(preview.summary.retireWarning).toMatch(/until it is reactivated/);
    expect(getAuthorityState(f.db)).toBe('active');
    expect(existsSync(f.out)).toBe(false);

    const plain = await f.call('backup.create.preview', { folder: f.out });
    expect(plain.summary.forTransfer).toBe(false);
    expect(plain.summary).not.toHaveProperty('retiresThisHub');
    expect(plain.summary).not.toHaveProperty('retireWarning');
    expect(plain.consequenceClass).toEqual(['filesystem-write', 'secret-management']);
    await expect(f.fail('backup.create.preview', { folder: f.out, forTransfer: 'yes' })).resolves.toMatchObject({ code: 'bad-request' });
  });

  it('writes and verifies the backup, then retires the Hub, audits it and closes the sockets', async () => {
    const f = fixture();
    const order: string[] = [];
    f.onTransferred.mockImplementation(() => { order.push(`sockets:${getAuthorityState(f.db)}`); });
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out, forTransfer: true });
    expect(getAuthorityState(f.db)).toBe('active');
    const applied = await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE, forTransfer: true });

    expect(applied.retired).toBe(true);
    expect(applied.manifest.forTransfer).toBe(true);
    expect(applied.manifest.source.authorityEpoch).toBe(3);
    // The file is complete and opens before the state flipped: the manifest records the ACTIVE source epoch.
    const opened = await openBackup(new Uint8Array(readFileSync(applied.file)), { passphrase: PASSPHRASE }, cheapDeps());
    expect(opened.manifest.forTransfer).toBe(true);
    expect(opened.files.has('dude.db')).toBe(true);
    expect(readdirSync(f.out)).toEqual([applied.name]);

    expect(getAuthorityState(f.db)).toBe('transferred');
    expect(getAuthorityEpoch(f.db)).toBe(3);
    expect(order).toEqual(['sockets:transferred']);
    expect(f.onTransferred).toHaveBeenCalledTimes(1);

    const rows = auditRows(f.db).filter((r) => r.event.startsWith('backup.'));
    expect(rows.map((r) => r.event)).toEqual(['backup.create-previewed', 'backup.created', 'backup.transferred']);
    const transferred = rows[2]!;
    expect(transferred.outcome).toBe('success');
    expect(JSON.parse(transferred.detail_json!)).toEqual({ epoch: 3, name: applied.name });
    expect(JSON.stringify(rows)).not.toContain(PASSPHRASE);
    expect(JSON.stringify(rows)).not.toContain(f.root);
  });

  it('retires only after the backup was written: a failing backup leaves the Hub active and calls nothing', async () => {
    const f = fixture();
    const blocker = path.join(f.root, 'blocker');
    writeFileSync(blocker, 'not a folder');
    const target = path.join(blocker, 'inside');
    const { confirmToken } = await f.call('backup.create.preview', { folder: target, forTransfer: true });
    const err = await f.fail('backup.create.apply', { confirmToken, folder: target, passphrase: PASSPHRASE, forTransfer: true });
    expect(err.code).toBe('backup-failed');
    expect(getAuthorityState(f.db)).toBe('active');
    expect(f.onTransferred).not.toHaveBeenCalled();
    expect(auditRows(f.db).some((r) => r.event === 'backup.transferred')).toBe(false);
  });

  it('a plain backup never changes the authority state', async () => {
    const f = fixture();
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out });
    const applied = await f.call('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE });
    expect(applied.retired).toBe(false);
    expect(applied.manifest.forTransfer).toBe(false);
    expect(getAuthorityState(f.db)).toBe('active');
    expect(getAuthorityEpoch(f.db)).toBe(3);
    expect(f.onTransferred).not.toHaveBeenCalled();
    expect(auditRows(f.db).some((r) => r.event === 'backup.transferred')).toBe(false);
  });

  it('refuses an apply whose forTransfer differs from the preview, in both directions, without writing', async () => {
    const f = fixture();
    const plain = (await f.call('backup.create.preview', { folder: f.out })).confirmToken;
    expect((await f.fail('backup.create.apply', { confirmToken: plain, folder: f.out, passphrase: PASSPHRASE, forTransfer: true })).code).toBe('conflict');
    const transfer = (await f.call('backup.create.preview', { folder: f.out, forTransfer: true })).confirmToken;
    expect((await f.fail('backup.create.apply', { confirmToken: transfer, folder: f.out, passphrase: PASSPHRASE })).code).toBe('conflict');
    const explicitFalse = (await f.call('backup.create.preview', { folder: f.out, forTransfer: true })).confirmToken;
    expect((await f.fail('backup.create.apply', { confirmToken: explicitFalse, folder: f.out, passphrase: PASSPHRASE, forTransfer: false })).code).toBe('conflict');
    expect(existsSync(f.out)).toBe(false);
    expect(getAuthorityState(f.db)).toBe('active');
    expect(f.onTransferred).not.toHaveBeenCalled();
  });

  it('keeps the verified file and reports retire-failed when the Hub cannot be retired', async () => {
    const f = fixture();
    const { confirmToken } = await f.call('backup.create.preview', { folder: f.out, forTransfer: true });
    // A trigger that rejects the state change stands in for a database failure after the backup was verified.
    f.db.exec("CREATE TRIGGER no_retire BEFORE INSERT ON meta WHEN NEW.key = 'authority_state' AND NEW.value = 'transferred' BEGIN SELECT RAISE(ABORT, 'blocked'); END;");
    f.db.exec("CREATE TRIGGER no_retire_upd BEFORE UPDATE ON meta WHEN NEW.key = 'authority_state' AND NEW.value = 'transferred' BEGIN SELECT RAISE(ABORT, 'blocked'); END;");
    const err = await f.fail('backup.create.apply', { confirmToken, folder: f.out, passphrase: PASSPHRASE, forTransfer: true });
    expect(err.code).toBe('backup-failed');
    expect(err.detail).toMatchObject({ reason: 'retire-failed' });
    expect(err.message).toMatch(/still active/);
    expect(err.message).not.toContain(PASSPHRASE);
    expect(readdirSync(f.out)).toHaveLength(1); // the verified backup is kept
    expect(getAuthorityState(f.db)).toBe('active');
    expect(f.onTransferred).not.toHaveBeenCalled();
    expect(auditRows(f.db).some((r) => r.event === 'backup.transferred')).toBe(false);
  });

  it('cannot start another transfer from a Hub that is already transferred', async () => {
    const f = fixture();
    setAuthority(f.db, { epoch: 3, state: 'transferred' });
    expect((await f.fail('backup.create.preview', { folder: f.out, forTransfer: true })).code).toBe('conflict');
    // A plain backup of a retired Hub is still allowed.
    expect((await f.call('backup.create.preview', { folder: f.out })).confirmToken).toEqual(expect.any(String));
  });
});

describe('backup reactivate', () => {
  it('refuses on an active Hub', async () => {
    const f = fixture();
    const err = await f.fail('backup.reactivate.preview');
    expect(err.code).toBe('conflict');
    expect(err.message).toBe('This Hub is not transferred.');
    expect((await f.fail('backup.reactivate.apply', { confirmToken: 'x' })).code).toMatch(/confirmation-required|conflict/);
  });

  it('previews, then returns the Hub to service under epoch + 1 and audits it', async () => {
    const f = fixture();
    setAuthority(f.db, { epoch: 3, state: 'transferred' });
    const preview = await f.call('backup.reactivate.preview');
    expect(preview.consequenceClass).toContain('system-config');
    expect(preview.summary).toMatchObject({ authorityEpoch: 3, newEpoch: 4 });
    expect(preview.summary.warning).toMatch(/two Hubs/);
    expect(preview.summary.warning).toMatch(/higher epoch/);
    expect(Date.parse(preview.expiresAt)).toBeGreaterThan(Date.parse('2026-10-04T12:00:00Z'));
    expect(getAuthorityState(f.db)).toBe('transferred');
    expect(getAuthorityEpoch(f.db)).toBe(3);

    const applied = await f.call('backup.reactivate.apply', { confirmToken: preview.confirmToken });
    expect(applied).toEqual({ authorityEpoch: 4, authorityState: 'active' });
    expect(getAuthorityState(f.db)).toBe('active');
    expect(getAuthorityEpoch(f.db)).toBe(4);
    expect(getMeta(f.db, 'authority_epoch')).toBe('4');
    const row = auditRows(f.db).find((r) => r.event === 'backup.reactivated')!;
    expect(row.outcome).toBe('success');
    expect(JSON.parse(row.detail_json!)).toEqual({ previousEpoch: 3, epoch: 4 });
  });

  it('is single-use, expires after 60 seconds and is refused without a token', async () => {
    const f = fixture();
    setAuthority(f.db, { epoch: 3, state: 'transferred' });
    expect((await f.fail('backup.reactivate.apply', {})).code).toBe('bad-request');
    expect((await f.fail('backup.reactivate.apply', { confirmToken: 'forged' })).code).toBe('confirmation-required');

    const stale = (await f.call('backup.reactivate.preview')).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('backup.reactivate.apply', { confirmToken: stale })).code).toBe('confirmation-required');
    expect(getAuthorityState(f.db)).toBe('transferred');

    const fresh = (await f.call('backup.reactivate.preview')).confirmToken;
    f.advance(CONFIRMATION_TTL_MS - 1);
    await f.call('backup.reactivate.apply', { confirmToken: fresh });
    expect(getAuthorityEpoch(f.db)).toBe(4);
    // A replay must not bump the epoch again, even if the Hub were retired once more.
    setAuthority(f.db, { epoch: 4, state: 'transferred' });
    expect((await f.fail('backup.reactivate.apply', { confirmToken: fresh })).code).toBe('confirmation-required');
    expect(getAuthorityEpoch(f.db)).toBe(4);
    expect(getAuthorityState(f.db)).toBe('transferred');
  });

  it('refuses a token minted for a different epoch (digest mismatch) and a backup-create token', async () => {
    const f = fixture();
    setAuthority(f.db, { epoch: 3, state: 'transferred' });
    const token = (await f.call('backup.reactivate.preview')).confirmToken;
    setAuthority(f.db, { epoch: 7, state: 'transferred' });
    expect((await f.fail('backup.reactivate.apply', { confirmToken: token })).code).toBe('conflict');
    expect(getAuthorityState(f.db)).toBe('transferred');
    expect(getAuthorityEpoch(f.db)).toBe(7);

    const createToken = (await f.call('backup.create.preview', { folder: f.out })).confirmToken;
    expect((await f.fail('backup.reactivate.apply', { confirmToken: createToken })).code).toBe('confirmation-required');
  });
});
