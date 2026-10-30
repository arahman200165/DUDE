import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { STANDBY_CONSEQUENCE_CLASS } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { applyBackupConfigChange, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import { CONFIRMATION_TTL_MS, ConfirmationStore } from '../security/confirmation-store.js';
import { SECURITY_ALERT_EVENTS } from '../server/routes/security-alerts.js';
import { startTestHub } from '../server/test-helpers.js';
import { standbyGrantOf } from '../standby/grants.js';
import type { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';

/**
 * Destructive-Action Contract for the warm-standby grant (32-SS1, Milestone 849, PD-151): granting opens the encrypted backup repository
 * to a device and revoking cuts a standby off, so both are a preview that changes nothing and stages a single-use 60-second
 * ConfirmationStore token bound to the device and the grant state it saw, an apply that spends it, `ConsequenceClass` tags, an audit
 * event, and the admin pipe as the only caller. Registered in the high-consequence gate by its file name (`confirmation-boundary`).
 */
const cleanups: Array<() => void> = [];
afterEach(() => { for (const step of cleanups.splice(0)) { try { step(); } catch { /* best effort */ } } });

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hub-standby-admin-'));
  const paths = hubPaths(root);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('expected ready');
  const { db } = opened.hub;
  cleanups.push(() => opened.hub.close(), () => rmSync(root, { recursive: true, force: true }));
  db.exec(`
INSERT INTO environment(environment_id, display_name, created_at) VALUES ('env', 'Home', 't');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at)
  VALUES ('pc', 'env', 'Desk PC', 'windows', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z');
INSERT INTO devices(device_id, environment_id, display_name, platform, app_version, capabilities_json, hub_eligible, protocol_version, registered_at, kind)
  VALUES ('browser', 'env', 'Browser', 'web', '1', '[]', 0, 1, '2026-10-01T00:00:00.000Z', 'browser');
`);
  writeHubConfig(paths.configFile, applyBackupConfigChange(loadOrCreateHubConfig(paths.configFile), {
    destinations: [{ id: 'usb', kind: 'local-folder', label: 'USB', folder: path.join(os.tmpdir(), 'standby-admin-dest') }],
  }));
  let clock = Date.parse('2026-10-27T10:00:00.000Z');
  const methods = buildAdminMethods({
    db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43), paths, now: () => clock, confirmations: new ConfirmationStore(),
  });
  const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);
  const fail = async (method: string, params: unknown = {}): Promise<AdminError> => {
    try { await call(method, params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  const audits = () => db.prepare("SELECT event, outcome, actor_kind, detail_json FROM audit_events WHERE event LIKE 'standby.%' ORDER BY seq").all() as Array<{ event: string; outcome: string; actor_kind: string; detail_json: string }>;
  const rows = () => db.prepare('SELECT device_id, granted_at FROM standby_grants').all();
  return { db, call, fail, audits, rows, advance: (ms: number) => { clock += ms; } };
}

describe('standby grant confirmation boundary', () => {
  it('the preview tags the consequence class, says what is served and changes nothing; the apply grants and audits', async () => {
    const f = fixture();
    const preview = await f.call('standby.grant.preview', { deviceId: 'pc' });
    expect(preview.consequenceClass).toEqual([...STANDBY_CONSEQUENCE_CLASS]);
    expect(preview.consequenceClass).toEqual(['authentication', 'database-write']);
    expect(preview.summary).toMatchObject({ deviceId: 'pc', displayName: 'Desk PC', alreadyGranted: false, repositories: 1 });
    expect(preview.summary.serves).toMatch(/encrypted/);
    expect(f.rows()).toEqual([]);
    expect(f.audits()).toEqual([]);

    expect(await f.call('standby.grant.apply', { deviceId: 'pc', confirmToken: preview.confirmToken })).toEqual({ deviceId: 'pc', granted: true, renewed: false });
    expect(standbyGrantOf(f.db, 'pc')).toEqual({ grantedAt: '2026-10-27T10:00:00.000Z' });
    expect(f.audits()).toEqual([{ event: 'standby.granted', outcome: 'success', actor_kind: 'cli', detail_json: JSON.stringify({ deviceId: 'pc', renewed: false }) }]);
    expect(await f.call('standby.list')).toEqual({ grants: [{ deviceId: 'pc', displayName: 'Desk PC', grantedAt: '2026-10-27T10:00:00.000Z', active: true }], repositories: 1 });
    // A grant and a revoke both reach the owner's security alerts (and so the notification producers).
    expect(SECURITY_ALERT_EVENTS).toEqual(expect.arrayContaining(['standby.granted', 'standby.revoked']));
  });

  it('the token is single-use, expires after 60 seconds, is bound to its action and device, and refuses a missing or forged value', async () => {
    const f = fixture();
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc' })).code).toBe('bad-request');
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc', confirmToken: 'forged' })).code).toBe('confirmation-required');
    const stale = (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc', confirmToken: stale })).code).toBe('confirmation-required');
    expect(f.rows()).toEqual([]);

    const fresh = (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken;
    await f.call('standby.grant.apply', { deviceId: 'pc', confirmToken: fresh });
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc', confirmToken: fresh })).code).toBe('confirmation-required');
    // A grant token cannot revoke, and a revoke token cannot grant.
    const grantToken = (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken;
    expect((await f.fail('standby.revoke.apply', { deviceId: 'pc', confirmToken: grantToken })).code).toBe('confirmation-required');
    expect(f.rows()).toHaveLength(1);
    f.db.exec("DELETE FROM standby_grants");
    f.db.exec("INSERT INTO standby_grants(device_id, device_registered_at, granted_at) VALUES ('pc', '2026-10-01T00:00:00.000Z', 'g')");
    const revokeToken = (await f.call('standby.revoke.preview', { deviceId: 'pc' })).confirmToken;
    f.db.exec("DELETE FROM standby_grants");
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc', confirmToken: revokeToken })).code).toBe('confirmation-required');
    expect(f.rows()).toEqual([]);
  });

  it('is bound to the previewed state: a re-enrolment between preview and apply is a conflict and grants nothing', async () => {
    const f = fixture();
    const { confirmToken } = await f.call('standby.grant.preview', { deviceId: 'pc' });
    f.db.exec("UPDATE devices SET registered_at = '2026-10-27T09:59:00.000Z' WHERE device_id = 'pc'");
    expect((await f.fail('standby.grant.apply', { deviceId: 'pc', confirmToken })).code).toBe('conflict');
    expect(f.rows()).toEqual([]);
    expect(f.audits()).toEqual([]);
  });

  it('refuses a device that cannot hold a grant, before any token is issued', async () => {
    const f = fixture();
    expect((await f.fail('standby.grant.preview', { deviceId: 'nobody' })).code).toBe('not-found');
    expect((await f.fail('standby.grant.preview', { deviceId: 'browser' })).code).toBe('bad-request');
    expect((await f.fail('standby.grant.preview', {})).code).toBe('bad-request');
    expect((await f.fail('standby.grant.preview', { deviceId: 'bad id with spaces' })).code).toBe('bad-request');
    f.db.exec("UPDATE devices SET needs_re_pair = 1 WHERE device_id = 'pc'");
    expect((await f.fail('standby.grant.preview', { deviceId: 'pc' })).code).toBe('conflict');
    f.db.exec("UPDATE devices SET needs_re_pair = 0, revoked_at = 't' WHERE device_id = 'pc'");
    expect((await f.fail('standby.grant.preview', { deviceId: 'pc' })).code).toBe('conflict');
    expect(f.rows()).toEqual([]);
  });
});

describe('standby revoke confirmation boundary', () => {
  it('previews without changing anything, then revokes exactly that device and audits it', async () => {
    const f = fixture();
    expect((await f.fail('standby.revoke.preview', { deviceId: 'pc' })).code).toBe('not-found');
    const grant = (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken;
    await f.call('standby.grant.apply', { deviceId: 'pc', confirmToken: grant });
    const preview = await f.call('standby.revoke.preview', { deviceId: 'pc' });
    expect(preview.consequenceClass).toEqual(['authentication', 'database-write']);
    expect(preview.summary).toMatchObject({ deviceId: 'pc', displayName: 'Desk PC' });
    expect(standbyGrantOf(f.db, 'pc')).not.toBeNull();
    expect(await f.call('standby.revoke.apply', { deviceId: 'pc', confirmToken: preview.confirmToken })).toEqual({ deviceId: 'pc', revoked: true });
    expect(standbyGrantOf(f.db, 'pc')).toBeNull();
    expect(f.rows()).toEqual([]);
    expect(f.audits().map((a) => [a.event, a.actor_kind, a.detail_json])).toEqual([
      ['standby.granted', 'cli', JSON.stringify({ deviceId: 'pc', renewed: false })],
      ['standby.revoked', 'cli', JSON.stringify({ deviceId: 'pc' })],
    ]);
    expect((await f.fail('standby.revoke.apply', { deviceId: 'pc', confirmToken: preview.confirmToken })).code).toBe('not-found');
  });

  it('is bound to the grant it saw: a renewed grant between preview and apply is a conflict and revokes nothing', async () => {
    const f = fixture();
    await f.call('standby.grant.apply', { deviceId: 'pc', confirmToken: (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken });
    const { confirmToken } = await f.call('standby.revoke.preview', { deviceId: 'pc' });
    f.advance(1000);
    await f.call('standby.grant.apply', { deviceId: 'pc', confirmToken: (await f.call('standby.grant.preview', { deviceId: 'pc' })).confirmToken });
    expect((await f.fail('standby.revoke.apply', { deviceId: 'pc', confirmToken })).code).toBe('conflict');
    expect(standbyGrantOf(f.db, 'pc')).not.toBeNull();
    f.advance(CONFIRMATION_TTL_MS + 1);
    const stale = (await f.call('standby.revoke.preview', { deviceId: 'pc' })).confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect((await f.fail('standby.revoke.apply', { deviceId: 'pc', confirmToken: stale })).code).toBe('confirmation-required');
    expect(standbyGrantOf(f.db, 'pc')).not.toBeNull();
  });
});

describe('the standby grant is reachable only over the admin pipe', () => {
  it('no HTTP route can grant or revoke, every standby route is a read, and no request-side module touches the grant writers', async () => {
    const hub = await startTestHub();
    try {
      const routes = hub.app.printRoutes({ commonPrefix: false });
      const standbyLines = routes.split('\n').filter((line) => /standby/i.test(line));
      expect(standbyLines.length).toBeGreaterThan(0);
      for (const line of standbyLines) expect(line).toMatch(/\((GET(, HEAD)?)\)\s*$/);
      expect(routes).not.toMatch(/standby[^\n]*(grant|revoke)/i);
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
        if (/grantStandby|revokeStandby|STANDBY_(?:GRANT|REVOKE)_ACTION|['"]standby\.(?:grant|revoke)\.|admin\/standby-methods/.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(srcRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
