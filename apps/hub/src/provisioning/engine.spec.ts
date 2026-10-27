import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubProvisioningResponse } from '@dude/contracts/hub';
import { getMeta, openSqliteDatabase } from '@dude/sqlite-store';
import { createSecretStore } from '../secrets/secret-store.js';
import { checkProvisioning, provision } from './engine.js';
import { listProvisioningComponents, registerProvisioningComponent } from './registry.js';
import { PROVISIONING_LAST_RUN_META } from './state.js';
import { EXPECTED_SECRETS_META } from './components/secrets.js';
import { cleanRoots, engineOptions, fakeProbes, restoreInto, tempPaths } from './provisioning-fixture.js';
import type { ProvisioningComponent } from './types.js';

afterEach(cleanRoots);

const stateOf = (report: { components: Array<{ id: string; state: string }> }, id: string): string | undefined => report.components.find((c) => c.id === id)?.state;
const countRows = (file: string, table: string): number => {
  const db = openSqliteDatabase(file);
  try { return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n); } finally { db.close(); }
};
const metaKeys = (file: string): string[] => {
  const db = openSqliteDatabase(file);
  try { return (db.prepare('SELECT key FROM meta ORDER BY key').all() as Array<{ key: string }>).map((r) => r.key); } finally { db.close(); }
};

describe('checkProvisioning on a Hub that never provisioned', () => {
  it('reports not-provisioned, creates nothing and leaves the optional probes meaningful', async () => {
    const paths = tempPaths();
    const report = await checkProvisioning(paths, engineOptions());
    expect(Value.Check(HubProvisioningResponse, report)).toBe(true);
    expect(report.overall).toBe('not-provisioned');
    expect(report.lastRun).toBeNull();
    expect(existsSync(paths.saveSphereDbPath)).toBe(false);
    expect(existsSync(paths.blobsDir)).toBe(false);
    expect(existsSync(paths.cacheDir)).toBe(false);
    expect(stateOf(report, 'content-store')).toBe('not-configured');
    expect(stateOf(report, 'blob-store')).toBe('not-configured');
    expect(stateOf(report, 'queue')).toBe('not-configured');
    expect(stateOf(report, 'fts')).toBe('ready');
    expect(stateOf(report, 'vector')).toBe('unavailable');
    expect(report.commands).toContain('dude-hub provision');
  });

  it('reports only the components that are built (a component that does not exist is absent, never faked)', async () => {
    const report = await checkProvisioning(tempPaths(), engineOptions());
    expect(report.components.map((c) => c.id)).toEqual(['content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets', 'tunnel']);
    for (const absent of ['oidc', 'power', 'backup']) expect(report.components.some((c) => c.id === absent)).toBe(false);
  });
});

describe('provision', () => {
  it('creates every component once and ends ready', async () => {
    const paths = tempPaths();
    const run = await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(run.failed).toEqual([]);
    expect(run.created).toEqual(['content-store', 'storage/blobs', 'storage/staging', 'storage/cache', 'storage/workers']);
    expect(run.report.overall).toBe('ready');
    expect(Value.Check(HubProvisioningResponse, run.report)).toBe(true);
    expect(run.report.lastRun).toEqual({ at: '2026-10-27T12:00:00.000Z', outcome: 'ok' });
    expect(run.report.components.map((c) => [c.id, c.state])).toEqual([
      ['content-store', 'ready'], ['fts', 'ready'], ['vector', 'unavailable'], ['blob-store', 'ready'], ['cache', 'ready'], ['queue', 'ready'], ['workers', 'ready'], ['secrets', 'not-configured'], ['tunnel', 'unavailable'],
    ]);
    expect(existsSync(paths.saveSphereDbPath) && existsSync(paths.blobsDir) && existsSync(paths.cacheDir)).toBe(true);
  });

  it('is idempotent: a second run creates nothing, adds no rows and leaves no probe residue', async () => {
    const paths = tempPaths();
    const first = await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    const keysAfterFirst = metaKeys(paths.saveSphereDbPath);
    const second = await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(second.created).toEqual([]);
    expect(second.report.components.map((c) => [c.id, c.state])).toEqual(first.report.components.map((c) => [c.id, c.state]));
    expect(second.report.overall).toBe(first.report.overall);
    expect(metaKeys(paths.saveSphereDbPath)).toEqual(keysAfterFirst);
    expect(countRows(paths.saveSphereDbPath, 'jobs')).toBe(0);
    expect(countRows(paths.saveSphereDbPath, 'blobs')).toBe(0);
    // The blob round trip ran in a scratch directory and removed it: the real blob tree and staging directory stay empty.
    expect(readdirSync(paths.blobsDir)).toEqual([]);
    expect(readdirSync(paths.stagingDir)).toEqual([]);
    expect(readdirSync(paths.cacheDir)).toEqual([]);
  });

  it('records one run per call: the last-run meta is a single key and each run writes one audit outbox row', async () => {
    const paths = tempPaths();
    const handed: number[] = [];
    await provision(paths, engineOptions({ hubInstanceId: 'hub-a', drainAudit: (db) => { handed.push(Number((db.prepare('SELECT COUNT(*) AS n FROM audit_outbox WHERE drained_at IS NULL').get() as { n: number }).n)); } }));
    await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(handed).toEqual([1]);
    const db = openSqliteDatabase(paths.saveSphereDbPath);
    try {
      const rows = db.prepare('SELECT event, outcome, actor_kind, payload_json FROM audit_outbox ORDER BY id').all() as Array<{ event: string; outcome: string; actor_kind: string; payload_json: string }>;
      expect(rows.map((r) => [r.event, r.outcome, r.actor_kind])).toEqual([['provisioning.run', 'success', 'cli'], ['provisioning.run', 'success', 'cli']]);
      // No path, no secret: only the overall state and counts.
      expect(rows[0]!.payload_json).not.toContain(paths.root);
      expect(JSON.parse(rows[0]!.payload_json)).toMatchObject({ overall: 'ready', failed: 0 });
      expect(JSON.parse(getMeta(db, PROVISIONING_LAST_RUN_META)!)).toMatchObject({ outcome: 'ok', hubInstanceId: 'hub-a' });
    } finally {
      db.close();
    }
  });

  it('contains a failing provision step: the run completes, reports it and records an attention outcome', async () => {
    const paths = tempPaths();
    const broken: ProvisioningComponent = { id: 'tunnel', provision: () => { throw new Error(`cannot write ${paths.root}`); }, check: () => ({ state: 'needs-attention', detail: 'The tunnel step failed.' }) };
    const run = await provision(paths, engineOptions({ components: [...listProvisioningComponents(), broken] }));
    expect(run.failed).toEqual(['tunnel']);
    expect(run.report.lastRun?.outcome).toBe('attention');
    expect(run.report.overall).toBe('needs-attention');
    expect(JSON.stringify(run.report)).not.toContain(paths.root);
  });

  it('contains a throwing check: the component becomes degraded with a redacted sentence', async () => {
    const paths = tempPaths();
    const noisy: ProvisioningComponent = { id: 'power', check: () => { throw new Error(`boom at ${paths.root}\\x token=abcdef123456`); } };
    const report = await checkProvisioning(paths, engineOptions({ components: [noisy] }));
    expect(report.components[0]).toMatchObject({ id: 'power', state: 'degraded' });
    expect(JSON.stringify(report)).not.toContain(paths.root);
    expect(JSON.stringify(report)).not.toContain('abcdef123456');
  });

  it('is single-flight: concurrent calls for one data directory share one run', async () => {
    const paths = tempPaths();
    let provisionCalls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: ProvisioningComponent = { id: 'oidc', provision: async () => { provisionCalls += 1; await gate; }, check: () => ({ state: 'ready', detail: 'ok' }) };
    const options = engineOptions({ components: [slow] });
    const a = provision(paths, options);
    const b = provision(paths, options);
    expect(b).toBe(a);
    release();
    const [first, second] = await Promise.all([a, b]);
    expect(first).toBe(second);
    expect(provisionCalls).toBe(1);
    // Once it settles the lock is free again.
    await provision(paths, options);
    expect(provisionCalls).toBe(2);
  });

  it('flags a restart when the store was created inside a Hub that started without the queue', async () => {
    const paths = tempPaths();
    const run = await provision(paths, engineOptions({ queueRunning: false }));
    expect(run.restartRequired).toBe(true);
    expect(stateOf(run.report, 'queue')).toBe('needs-attention');
    expect(run.report.overall).toBe('needs-attention');
    const again = await provision(paths, engineOptions({ queueRunning: false }));
    expect(again.restartRequired).toBe(false);
  });
});

describe('a restored data directory', () => {
  it('needs provisioning and secrets re-entry, then recovers once provisioned and the secret is entered again', async () => {
    const original = tempPaths('original');
    await provision(original, engineOptions({ hubInstanceId: 'hub-old' }));
    // The owner stored a tunnel token on the old machine; the next run recorded that the purpose is expected.
    createSecretStore({ secretsDir: original.secretsDir, platform: 'linux' }).put('tunnel.connectorToken', 'not-a-real-token-value');
    await provision(original, engineOptions({ hubInstanceId: 'hub-old' }));
    const before = await checkProvisioning(original, engineOptions({ hubInstanceId: 'hub-old' }));
    expect(before.overall).toBe('ready');
    expect(before.secrets.find((s) => s.purpose === 'tunnel.connectorToken')).toEqual({ purpose: 'tunnel.connectorToken', present: true, needsReentry: false });

    // 31G restore onto a new identity: savesphere.db survives, secrets and storage directories do not, hub.json is reduced.
    const restored = restoreInto(original);
    expect(existsSync(restored.secretsDir)).toBe(false);
    const after = await checkProvisioning(restored, engineOptions({ hubInstanceId: 'hub-new' }));
    expect(after.overall).toBe('needs-provisioning');
    expect(after.secrets.find((s) => s.purpose === 'tunnel.connectorToken')).toEqual({ purpose: 'tunnel.connectorToken', present: false, needsReentry: true });
    expect(stateOf(after, 'secrets')).toBe('needs-attention');
    expect(stateOf(after, 'blob-store')).toBe('not-configured');
    expect(stateOf(after, 'cache')).toBe('not-configured');
    expect(stateOf(after, 'content-store')).toBe('ready');
    expect(JSON.stringify(after)).not.toContain('not-a-real-token-value');

    // Provisioning recreates the storage but cannot invent the secret: still needs the owner to re-enter it.
    const run = await provision(restored, engineOptions({ hubInstanceId: 'hub-new' }));
    expect(run.created).toEqual(['storage/blobs', 'storage/staging', 'storage/cache', 'storage/workers']);
    expect(run.report.overall).toBe('needs-provisioning');
    createSecretStore({ secretsDir: restored.secretsDir, platform: 'linux' }).put('tunnel.connectorToken', 'entered-again');
    expect((await checkProvisioning(restored, engineOptions({ hubInstanceId: 'hub-new' }))).overall).toBe('ready');
  });

  it('treats a run recorded by another Hub identity as needing provisioning even with nothing else missing', async () => {
    const original = tempPaths('original');
    await provision(original, engineOptions({ hubInstanceId: 'hub-old' }));
    const report = await checkProvisioning(original, engineOptions({ hubInstanceId: 'hub-other' }));
    expect(report.overall).toBe('needs-provisioning');
  });

  it('keeps the expected-secrets list in the content store, names only', async () => {
    const paths = tempPaths();
    await provision(paths, engineOptions());
    createSecretStore({ secretsDir: paths.secretsDir, platform: 'linux' }).put('oidc.clientSecret', 'super-secret-value');
    await provision(paths, engineOptions());
    const db = openSqliteDatabase(paths.saveSphereDbPath);
    try {
      expect(getMeta(db, EXPECTED_SECRETS_META)).toBe(JSON.stringify(['oidc.clientSecret']));
    } finally {
      db.close();
    }
  });
});

describe('registerProvisioningComponent', () => {
  it('refuses an id outside the closed list and a duplicate, and an added component joins the report without touching the engine', async () => {
    expect(() => registerProvisioningComponent({ id: 'redis' as never, check: () => ({ state: 'ready', detail: 'x' }) })).toThrow(/Unknown provisioning component/);
    expect(() => registerProvisioningComponent({ id: 'content-store', check: () => ({ state: 'ready', detail: 'x' }) })).toThrow(/already registered/);
    const remove = registerProvisioningComponent({ id: 'power', check: () => ({ state: 'ready', detail: 'Sleep is off.' }) });
    try {
      const report = await checkProvisioning(tempPaths(), engineOptions());
      expect(report.components.map((c) => c.id)).toContain('power');
      expect(report.components.at(-1)).toMatchObject({ id: 'power', state: 'ready' });
    } finally {
      remove();
    }
    expect(listProvisioningComponents().some((c) => c.id === 'power')).toBe(false);
  });
});

describe('probe failures degrade honestly', () => {
  it('reports a missing FTS5, a failed worker spawn and a low disk without paths or error text', async () => {
    const paths = tempPaths();
    const options = engineOptions({
      probes: fakeProbes({ fts5: () => { throw new Error('no such module: fts5'); }, workerPing: () => Promise.reject(new Error(`spawn ${paths.root}\\dude-hub.exe ENOENT`)), freeBytes: () => 100 }),
    });
    const run = await provision(paths, options);
    expect(stateOf(run.report, 'fts')).toBe('degraded');
    expect(stateOf(run.report, 'workers')).toBe('degraded');
    expect(stateOf(run.report, 'blob-store')).toBe('degraded');
    expect(run.report.overall).toBe('degraded');
    expect(JSON.stringify(run.report)).not.toContain(paths.root);
    expect(run.report.components.find((c) => c.id === 'blob-store')?.nextAction).toMatch(/Free disk space/);
  });
});
