import { isAgentMethod } from '@dude/contracts';
import type {
  AgentJournalEntry, AgentMethod, AgentMethodMap, AgentResponse, AgentSecretStatus, DeviceStoreBoot, StoreHealth,
} from '@dude/contracts';
import { isSecretPurpose, uuidv7 } from '@dude/persistence';
import type { SecretPurpose } from '@dude/persistence';
import type { DeviceStore } from '../store/open-store.js';
import type { Db } from '@dude/sqlite-store';
import { getMeta, setMeta } from '@dude/sqlite-store';
import { readDeviceRecord, renameDevice } from '../store/identity.js';
import { commitEntity, importMany, listRecords } from '../store/entity-commit.js';
import type { CommitContext } from '../store/entity-commit.js';
import { commitKvBatch, SqliteKeyValueRepository } from '../store/repos/kv.repo.js';
import { SqliteHistoryRepository } from '../store/repos/history.repo.js';
import { SqliteNetworkRunRepository } from '../store/repos/network-runs.repo.js';
import { appendJournal, getJournal, listJournal, removeJournal, trimJournal, updateJournal } from '../store/repos/journal.repo.js';
import { getSnapshotHeader, listSnapshotHeaders, removeSnapshotHeader, upsertSnapshotHeader } from '../store/repos/snapshots.repo.js';
import { addPowerShellHistory, clearPowerShellHistory, listPowerShellHistory } from '../store/repos/powershell-history.repo.js';
import { getDoc, removeDoc, setDoc } from '../store/repos/device-docs.repo.js';
import { getSecretCiphertext, listSecretStatus, removeSecret, secretStatus, setSecretCiphertext } from '../store/repos/secrets.repo.js';
import type { SecretStatusRow } from '../store/repos/secrets.repo.js';
import { publicEnrollment } from '../store/repos/hub-enrollment.repo.js';
import { applyReset, previewReset } from '../store/reset.js';
import { DEFAULT_HISTORY_RETENTION } from '../store/repos/retention.js';
import { quarantineStore } from '../store/open-store.js';
import { HubApiError, HubProtocolError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import { HubManagerError } from '../hub/errors.js';
import type { HubRuntime } from '../hub/index.js';

export interface RpcDeps {
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
  /** Per-entity-type codec contexts handed to entity commits (e.g. the home-layout panel catalog). */
  codecCtx?: Readonly<Record<string, unknown>>;
  /** Set when the store could not be opened: only `store.health` (and `store.shutdown`) are served. */
  unavailable?: { status: 'incompatible' | 'corrupt'; message: string };
  /** The store directory; needed by `store.quarantine`, which only runs while the store is unavailable. */
  storeDir?: string;
  /** Hub connection runtime; absent in tests that do not exercise the Hub. */
  hub?: HubRuntime;
}

export interface RpcServer {
  handle(message: unknown): Promise<AgentResponse>;
  /** True once `store.shutdown` has completed. */
  readonly closed: boolean;
}

class RpcError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

type Handlers = { [M in keyof AgentMethodMap]: (params: AgentMethodMap[M]['params']) => AgentMethodMap[M]['result'] | Promise<AgentMethodMap[M]['result']> };

const invalid = (message: string): RpcError => new RpcError('invalid-params', message);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function str(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) throw invalid(`${name} must be a non-empty string.`);
  return v;
}
function engineOf(v: unknown): 'fs' | 'sys' {
  if (v !== 'fs' && v !== 'sys') throw invalid('engine must be "fs" or "sys".');
  return v;
}
function purposeOf(v: unknown): SecretPurpose {
  if (!isSecretPurpose(v)) throw invalid('Unknown secret purpose.');
  return v;
}
function optLimit(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw invalid('limit must be a number.');
  return v;
}
function entryOf(v: unknown): AgentJournalEntry {
  if (!isObject(v) || typeof v.planId !== 'string' || typeof v.appliedAt !== 'string') throw invalid('Journal entry needs planId and appliedAt.');
  return v as AgentJournalEntry;
}

/** Maps Hub-layer failures to RPC errors. Messages never carry credentials. */
async function hubGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RpcError) throw error;
    if (error instanceof HubManagerError) throw new RpcError(error.code, error.message);
    if (error instanceof HubApiError) throw new RpcError(`hub-${error.code}`, error.message);
    if (error instanceof HubProtocolError) throw new RpcError('hub-protocol', 'The Hub answered with an unexpected response.');
    throw error;
  }
}

const statusOf = (row: SecretStatusRow): AgentSecretStatus => ({ ...row });

function storeHealthUnavailable(deps: RpcDeps): StoreHealth {
  const u = deps.unavailable ?? { status: 'corrupt' as const, message: 'The device store is not available.' };
  return {
    status: u.status, schemaVersion: 0, minReaderVersion: 0, sizeBytes: 0,
    outbox: { pending: 0, maxRows: 0, backpressure: false }, legacyImport: 'none', message: u.message,
  };
}

export function createRpcServer(store: DeviceStore | null, deps: RpcDeps): RpcServer {
  let closed = false;

  const db = (): Db => (store as DeviceStore).db;
  const commitCtx = (): CommitContext => {
    const database = db();
    return {
      deviceId: getMeta(database, 'device_id') ?? '',
      environmentId: getMeta(database, 'environment_id') ?? '',
      now: deps.now,
      newOpId: () => uuidv7(deps.randomBytes, () => deps.now().getTime()),
      codecCtx: deps.codecCtx,
    };
  };
  const nowMs = (): number => deps.now().getTime();
  // Repos hold the database handle; they are created lazily so an unavailable store never touches them.
  const repos = (): { kv: SqliteKeyValueRepository; history: SqliteHistoryRepository; network: SqliteNetworkRunRepository } => {
    const database = db();
    return {
      kv: new SqliteKeyValueRepository(database, deps.now),
      history: new SqliteHistoryRepository(database, DEFAULT_HISTORY_RETENTION, nowMs),
      network: new SqliteNetworkRunRepository(database, undefined, nowMs),
    };
  };

  const hubRuntime = (): HubRuntime => {
    if (!deps.hub) throw new RpcError('unavailable', 'Hub support is not available.');
    return deps.hub;
  };
  const owner = <T>(fn: (api: HubClient, ownerToken: string) => Promise<T>): Promise<T> => hubGuard(() => hubRuntime().manager.owner.withOwner(fn));

  const handlers: Handlers = {
    'store.open': () => (store as DeviceStore).health(),
    'store.health': () => (store as DeviceStore).health(),
    'store.hydrate': async (): Promise<DeviceStoreBoot> => {
      const s = store as DeviceStore;
      const device = readDeviceRecord(s.db, s.device.capabilities);
      return {
        status: 'ready',
        device: {
          deviceId: device.deviceId,
          environmentId: getMeta(s.db, 'environment_id') ?? '',
          displayName: device.displayName,
          platform: device.platform,
          appVersion: device.appVersion,
          enrollmentState: device.enrollmentState,
          ...(device.enrollment === undefined ? {} : { enrollment: device.enrollment }),
          ...(device.clonedFrom === undefined ? {} : { clonedFrom: device.clonedFrom }),
        },
        kv: await repos().kv.snapshot(),
        records: listRecords(s.db).map((r) => ({ entityType: r.entityType, entityId: r.entityId, payload: r.payload })),
      };
    },
    'kv.commit': (p) => {
      if (!Array.isArray(p.mutations)) throw invalid('mutations must be an array.');
      commitKvBatch(db(), p.mutations, undefined, deps.now, commitCtx());
      return { count: p.mutations.length };
    },
    'entity.commit': (p) => commitEntity(db(), commitCtx(), p),
    'entity.importMany': (p) => {
      if (!Array.isArray(p.items)) throw invalid('items must be an array.');
      const commits = p.items.map((item) => ({ entityType: p.entityType, entityId: item.entityId, op: 'upsert' as const, payload: item.payload }));
      return importMany(db(), commitCtx(), commits);
    },
    'history.add': async (p) => {
      const result = await repos().history.add(p.entry);
      return result.ok ? result : { ok: false, error: result.error };
    },
    'history.list': async (p) => {
      const { history } = repos();
      const limit = optLimit(p.limit);
      if (p.toolId !== undefined) {
        const all = await history.listByTool(str(p.toolId, 'toolId'));
        return limit === undefined ? all : all.slice(0, Math.max(0, limit));
      }
      return history.listRecent(limit ?? DEFAULT_HISTORY_RETENTION.maxTotal);
    },
    'history.get': async (p) => (await repos().history.get(str(p.id, 'id'))) ?? null,
    'history.remove': async (p) => { await repos().history.remove(str(p.id, 'id')); return { ok: true }; },
    'history.clear': async () => { await repos().history.clear(); return { ok: true }; },
    'history.clearTool': async (p) => { await repos().history.clearTool(str(p.toolId, 'toolId')); return { ok: true }; },
    'network.add': async (p) => {
      const result = await repos().network.add(p.run);
      return result.ok ? result : { ok: false, error: result.error };
    },
    'network.list': async (p) => {
      const all = await repos().network.list();
      const limit = optLimit(p.limit);
      return limit === undefined ? all : all.slice(0, Math.max(0, limit));
    },
    'network.get': async (p) => (await repos().network.get(str(p.id, 'id'))) ?? null,
    'network.remove': async (p) => { await repos().network.remove(str(p.id, 'id')); return { ok: true }; },
    'network.clear': async () => { await repos().network.clear(); return { ok: true }; },
    'journal.append': (p) => { appendJournal(db(), engineOf(p.engine), entryOf(p.entry)); return { ok: true }; },
    'journal.list': (p) => listJournal<AgentJournalEntry>(db(), engineOf(p.engine), optLimit(p.limit)),
    'journal.get': (p) => getJournal<AgentJournalEntry>(db(), engineOf(p.engine), str(p.planId, 'planId')),
    'journal.update': (p) => ({ ok: updateJournal(db(), engineOf(p.engine), str(p.planId, 'planId'), entryOf(p.entry)) }),
    'journal.remove': (p) => { removeJournal(db(), engineOf(p.engine), str(p.planId, 'planId')); return { ok: true }; },
    'journal.trim': (p) => {
      if (typeof p.keep !== 'number' || !Number.isFinite(p.keep) || p.keep < 0) throw invalid('keep must be a non-negative number.');
      return { removed: trimJournal<AgentJournalEntry>(db(), engineOf(p.engine), p.keep) };
    },
    'snapshots.upsert': (p) => {
      if (typeof p.createdAt !== 'number' || !Number.isFinite(p.createdAt)) throw invalid('createdAt must be a number.');
      upsertSnapshotHeader(db(), str(p.kind, 'kind'), str(p.id, 'id'), p.createdAt, p.header);
      return { ok: true };
    },
    'snapshots.list': (p) => listSnapshotHeaders(db(), str(p.kind, 'kind')),
    'snapshots.get': (p) => getSnapshotHeader(db(), str(p.kind, 'kind'), str(p.id, 'id')),
    'snapshots.remove': (p) => ({ ok: removeSnapshotHeader(db(), str(p.kind, 'kind'), str(p.id, 'id')) }),
    'powershell.add': (p) => {
      if (!isObject(p.entry)) throw invalid('entry must be an object.');
      str(p.entry.id, 'entry.id');
      addPowerShellHistory(db(), p.entry, nowMs);
      return { ok: true };
    },
    'powershell.list': () => listPowerShellHistory(db()),
    'powershell.clear': () => { clearPowerShellHistory(db()); return { ok: true }; },
    'docs.get': (p) => getDoc(db(), p.name) ?? null,
    'docs.set': (p) => { setDoc(db(), p.name, p.value, deps.now); return { ok: true }; },
    'docs.remove': (p) => ({ ok: removeDoc(db(), p.name) }),
    'secrets.status': (p) => statusOf(secretStatus(db(), purposeOf(p.purpose))),
    'secrets.list': () => listSecretStatus(db()).map(statusOf),
    'secrets.set': (p) => {
      const purpose = purposeOf(p.purpose);
      setSecretCiphertext(db(), purpose, p.ciphertext, deps.now(), () => `secret:${uuidv7(deps.randomBytes, nowMs)}`);
      return statusOf(secretStatus(db(), purpose));
    },
    'secrets.remove': (p) => {
      const purpose = purposeOf(p.purpose);
      removeSecret(db(), purpose);
      return statusOf(secretStatus(db(), purpose));
    },
    'secrets.getCiphertext': (p) => ({ ciphertext: getSecretCiphertext(db(), purposeOf(p.purpose), deps.now()) }),
    'device.rename': (p) => {
      const result = renameDevice(db(), p.displayName);
      return result.ok ? { ok: true, displayName: result.value } : { ok: false, error: result.error };
    },
    'reset.preview': (p) => previewReset(db(), p.kind),
    'reset.apply': (p) => {
      const result = applyReset(db(), p.kind, str(p.digest, 'digest'), { now: deps.now, randomBytes: deps.randomBytes });
      return result.ok ? result : { ok: false, error: result.error };
    },
    'hub.enrollment': () => publicEnrollment(db()),
    'hub.status': () => hubRuntime().manager.status(),
    'hub.probeLocal': (p) => {
      if (p.port !== undefined && (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535)) throw invalid('port must be a TCP port.');
      return hubRuntime().probeLocal(p.port);
    },
    'hub.enroll': (p) => hubGuard(() => hubRuntime().enroll(str(p.pairingString, 'pairingString'))),
    'hub.unenroll': (p) => hubGuard(async () => {
      const { hubStillListsDevice } = await hubRuntime().manager.unenroll({ force: p.force === true });
      return { ok: true as const, hubStillListsDevice };
    }),
    'hub.owner.signIn': (p) => hubGuard(() => hubRuntime().manager.owner.signIn(str(p.password, 'password'))),
    'hub.owner.signOut': async () => { await hubRuntime().manager.owner.signOut(); return { ok: true }; },
    'hub.owner.status': () => hubRuntime().manager.owner.status(),
    'hub.recoverOwner': (p) => hubGuard(async () => { await hubRuntime().manager.recoverOwner(str(p.newPassword, 'newPassword')); return { ok: true as const }; }),
    'hub.owner.listDevices': () => owner((api, t) => api.listDevices(t)),
    'hub.owner.createPairingCode': (p) => owner((api, t) => api.createPairingCode(t, p.host === undefined ? {} : { host: str(p.host, 'host') })),
    'hub.owner.renameDevice': (p) => owner((api, t) => api.renameDevice(t, str(p.deviceId, 'deviceId'), str(p.displayName, 'displayName'))),
    'hub.owner.revokeDevicePreview': (p) => owner((api, t) => api.revokeDevicePreview(t, str(p.deviceId, 'deviceId'))),
    'hub.owner.revokeDevice': (p) => owner((api, t) => api.revokeDevice(t, str(p.deviceId, 'deviceId'), str(p.confirmToken, 'confirmToken'))),
    'hub.owner.setRecoveryTrust': (p) => {
      if (typeof p.trusted !== 'boolean') throw invalid('trusted must be a boolean.');
      const trusted = p.trusted;
      return owner((api, t) => api.setRecoveryTrust(t, str(p.deviceId, 'deviceId'), str(p.password, 'password'), trusted));
    },
    'hub.owner.listSessions': () => owner((api, t) => api.listSessions(t)),
    'hub.owner.revokeSession': (p) => owner((api, t) => api.revokeSession(t, str(p.sessionId, 'sessionId'))),
    'hub.owner.revokeAllPreview': () => owner((api, t) => api.revokeAllPreview(t)),
    'hub.owner.revokeAll': (p) => owner((api, t) => api.revokeAll(t, str(p.confirmToken, 'confirmToken'))),
    'hub.owner.listAudit': (p) => owner((api, t) => api.listAudit(t, { ...(p.beforeSeq === undefined ? {} : { beforeSeq: Number(p.beforeSeq) }), ...(p.limit === undefined ? {} : { limit: Number(p.limit) }) })),
    'hub.owner.recoveryCodesPreview': () => owner((api, t) => api.recoveryCodesPreview(t)),
    'hub.owner.regenerateRecoveryCodes': (p) => owner((api, t) => api.regenerateRecoveryCodes(t, str(p.confirmToken, 'confirmToken'))),
    'hub.owner.changePassword': (p) => owner((api, t) => api.changePassword(t, str(p.currentPassword, 'currentPassword'), str(p.newPassword, 'newPassword'))),
    // The legacy userData import is implemented in M621; until then nothing is imported.
    'legacy.import': () => ({ status: 'none', imported: {}, warnings: [] }),
    'store.cleanExit': (p) => {
      const database = db();
      const stored = getMeta(database, 'last_clean_exit');
      const previous = stored === undefined ? 'none' : stored === 'pending' ? 'unclean' : 'clean';
      if (p.action === 'launch') setMeta(database, 'last_clean_exit', 'pending');
      else if (p.action === 'quit') setMeta(database, 'last_clean_exit', deps.now().toISOString());
      else if (p.action !== 'check') throw invalid('action must be launch, quit or check.');
      return { previous };
    },
    // Reached only with an open store, which must never be quarantined (the unavailable path is in `handle`).
    'store.quarantine': () => { throw new RpcError('forbidden', 'The device store is open and cannot be quarantined.'); },
    'store.checkpoint': () => {
      (store as DeviceStore).db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return { ok: true };
    },
    'store.shutdown': () => {
      deps.hub?.manager.stop();
      if (store) {
        try { store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* best effort; close still runs */ }
        store.close();
      }
      closed = true;
      return { ok: true };
    },
  };

  const fail = (id: number, code: string, message: string): AgentResponse => ({ id, ok: false, error: { code, message } });

  async function handle(message: unknown): Promise<AgentResponse> {
    if (!isObject(message) || typeof message.id !== 'number' || !Number.isFinite(message.id) || typeof message.method !== 'string') {
      return fail(isObject(message) && typeof message.id === 'number' ? message.id : -1, 'bad-request', 'Malformed request envelope.');
    }
    const id = message.id;
    if (!isAgentMethod(message.method)) return fail(id, 'unknown-method', 'Unknown method.');
    const method: AgentMethod = message.method;
    const params = message.params === undefined ? {} : message.params;
    if (!isObject(params)) return fail(id, 'bad-request', 'params must be an object.');

    if (closed) return fail(id, 'closed', 'The device store is closed.');
    if (store === null) {
      if (method === 'store.health') return { id, ok: true, result: storeHealthUnavailable(deps) };
      if (method === 'store.shutdown') { closed = true; return { id, ok: true, result: { ok: true } }; }
      if (method === 'store.quarantine') {
        if (!deps.storeDir) return fail(id, 'unavailable', 'The store directory is not known.');
        try {
          const target = quarantineStore(deps.storeDir, deps.now());
          closed = true;
          return { id, ok: true, result: { ok: true, path: target } };
        } catch (error) {
          return fail(id, 'internal', error instanceof Error ? error.message : 'Quarantine failed.');
        }
      }
      return fail(id, 'unavailable', 'The device store is not available.');
    }

    try {
      const handler = handlers[method] as (p: unknown) => unknown;
      return { id, ok: true, result: await handler(params) } as AgentResponse;
    } catch (error) {
      if (error instanceof RpcError) return fail(id, error.code, error.message);
      return fail(id, 'internal', error instanceof Error ? error.message : 'Internal error.');
    }
  }

  return { handle, get closed() { return closed; } };
}
