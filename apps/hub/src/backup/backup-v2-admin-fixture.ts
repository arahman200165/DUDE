import { rmSync } from 'node:fs';
import path from 'node:path';
import type { AdminError } from '../admin/admin-endpoint.js';
import { buildAdminMethods } from '../admin/methods.js';
import type { HubDb } from '../db/open-hub-db.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { memoryMasterKeys, openFixtureHub, openSaveSphereFixture, randomCheapDeps, seedHubDb, tempRoot } from './backup-fixture.js';

/** Spec-only: the admin methods of a fixture Hub with `savesphere.db`, an in-memory master-key store and small packs. */
export const V2_PASSPHRASE = 'backup v2 admin passphrase';

export function openV2AdminFixture(label: string) {
  const cleanup: Array<() => void> = [];
  const root = tempRoot(label);
  const { hub, paths } = openFixtureHub(root);
  seedHubDb(hub.db);
  let clock = Date.parse('2026-10-04T12:00:00Z');
  const now = (): number => clock;
  const ss = openSaveSphereFixture(paths, now);
  const keys = memoryMasterKeys();
  const confirmations = new ConfirmationStore();
  const deps = randomCheapDeps(() => new Date(clock));
  const methods = buildAdminMethods({
    db: hub.db, hubVersion: '1.2.3', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, spkiSha256: 'S'.repeat(43), paths,
    backupDeps: deps, masterKeyStore: keys, saveSphereDb: () => ss.sdb, backupRunTest: { chunkSize: 4096, packBytes: 32 * 1024 },
    now, confirmations,
  });
  const call = async (method: string, params: unknown = {}): Promise<any> => methods[method]!(params);
  const fail = async (method: string, params: unknown = {}): Promise<AdminError> => {
    try { await call(method, params); } catch (error) { return error as AdminError; }
    throw new Error(`${method} did not fail`);
  };
  const folder = (name: string): string => path.join(root, 'destinations', name);
  cleanup.push(() => ss.close(), () => (hub as HubDb).close(), () => rmSync(root, { recursive: true, force: true }));
  return {
    root, hub, db: hub.db, paths, ss, keys, confirmations, deps, methods, call, fail, folder, now,
    advance: (ms: number) => { clock += ms; },
    auditRows: (): Array<{ event: string; outcome: string; actor_kind: string; detail_json: string | null }> =>
      hub.db.prepare('SELECT event, outcome, actor_kind, detail_json FROM audit_events ORDER BY seq').all() as never,
    close: () => { for (const step of cleanup.splice(0)) { try { step(); } catch { /* best effort */ } } },
  };
}
