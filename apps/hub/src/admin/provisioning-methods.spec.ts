import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubProvisioningResponse } from '@dude/contracts/hub';
import { getMeta, openSqliteDatabase } from '@dude/sqlite-store';
import { openFixtureHub, tempRoot } from '../backup/backup-fixture.js';
import type { HubDb } from '../db/open-hub-db.js';
import { fakeProbes } from '../provisioning/provisioning-fixture.js';
import { AdminError } from './admin-endpoint.js';
import { buildAdminMethods } from './methods.js';
import { parseProvisionParams } from './provisioning-methods.js';

const roots: string[] = [];
const hubs: HubDb[] = [];
afterEach(() => {
  for (const hub of hubs.splice(0)) hub.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// `provisioningTest` swaps in fake probes and the Linux secret-file fallback, so no worker process starts and no library loads.
function fixture(options: { withPaths?: boolean; queueRunning?: boolean } = {}) {
  const root = tempRoot('provision');
  roots.push(root);
  const { hub, paths } = openFixtureHub(root);
  hubs.push(hub);
  let provisioned = 0;
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43),
    ...(options.withPaths === false ? {} : { paths }),
    ...(options.queueRunning === undefined ? {} : { queueRunning: () => options.queueRunning! }),
    onProvisioned: () => { provisioned += 1; },
    provisioningTest: { platform: 'linux', probes: fakeProbes() },
    now: () => Date.parse('2026-10-27T12:00:00Z'),
  });
  const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);
  const fail = async (method: string, params: unknown = {}): Promise<AdminError> => {
    try { await call(method, params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  return { hub, paths, methods, call, fail, provisioned: () => provisioned };
}

describe('provision admin methods', () => {
  it('registers provision.run and provision.status on the admin pipe only', () => {
    const f = fixture();
    expect(Object.keys(f.methods).filter((m) => m.startsWith('provision.')).sort()).toEqual(['provision.run', 'provision.status']);
  });

  it('refuses a context without a data layout, and any parameter', async () => {
    const bare = fixture({ withPaths: false });
    expect((await bare.fail('provision.run')).code).toBe('unavailable');
    expect((await bare.fail('provision.status')).code).toBe('unavailable');
    const f = fixture();
    for (const params of [{ secrets: { 'tunnel.connectorToken': 'abc' } }, { anything: 1 }, [], 'text']) {
      const error = await f.fail('provision.run', params);
      expect(error.code).toBe('bad-request');
      expect(error.message).not.toContain('abc');
      expect(error.message).not.toContain('secrets');
    }
    expect(parseProvisionParams(undefined)).toEqual({});
    expect(parseProvisionParams(null)).toEqual({});
    expect(parseProvisionParams({})).toEqual({});
  });

  it('status never creates the content store and reports not-provisioned', async () => {
    const f = fixture();
    const { report } = await f.call('provision.status');
    expect(Value.Check(HubProvisioningResponse, report)).toBe(true);
    expect(report.overall).toBe('not-provisioned');
    expect(existsSync(f.paths.saveSphereDbPath)).toBe(false);
    expect(f.hub.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event = 'provisioning.run'").get()).toEqual({ n: 0 });
  });

  it('run provisions, audits through the outbox into dude.db, drops the status cache and is repeatable', async () => {
    const f = fixture({ queueRunning: false });
    const first = await f.call('provision.run');
    expect(Value.Check(HubProvisioningResponse, first.report)).toBe(true);
    expect(first.created).toContain('content-store');
    expect(first.restartRequired).toBe(true);
    expect(first.failed).toEqual([]);
    expect(f.provisioned()).toBe(1);
    const events = (): Array<{ event: string; outcome: string; actor_kind: string; detail_json: string }> =>
      f.hub.db.prepare("SELECT event, outcome, actor_kind, detail_json FROM audit_events WHERE event = 'provisioning.run'").all() as never;
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ outcome: 'success', actor_kind: 'cli' });
    expect(events()[0]!.detail_json).not.toContain(f.paths.root);
    const store = openSqliteDatabase(f.paths.saveSphereDbPath);
    try {
      expect(JSON.parse(getMeta(store, 'provisioning_last_run')!)).toMatchObject({ outcome: 'ok', hubInstanceId: f.hub.hubInstanceId });
      expect(store.prepare('SELECT COUNT(*) AS n FROM audit_outbox WHERE drained_at IS NULL').get()).toEqual({ n: 0 });
    } finally {
      store.close();
    }
    const second = await f.call('provision.run', {});
    expect(second.created).toEqual([]);
    expect(second.restartRequired).toBe(false);
    expect(events()).toHaveLength(2);
    expect(f.provisioned()).toBe(2);
  });
});
