import { mkdir, open, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { HubApiError, HubProtocolError, isHubTransferredError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import type { AgentHubState, AgentHubStatus, AgentStandbyPhase, AgentStandbyRepositoryStatus, AgentStandbyStatus } from '@dude/contracts';
import { STANDBY_LIST_LIMIT_MAX, STANDBY_REPO_OBJECT } from '@dude/contracts/hub';
import type { StandbyObjectPrefix } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { getMeta } from '@dude/sqlite-store';
import { HubManagerError } from '../hub/errors.js';
import { getDoc, setDoc } from '../store/repos/device-docs.repo.js';
import {
  STANDBY_DESTINATION_ID, StandbyError, fileSize, hostile, listLocal, listPartials, mirrorPaths, objectKind, objectPath, partialPath,
} from './standby-mirror.js';
import type { MirrorPaths } from './standby-mirror.js';

/**
 * The warm standby PULLER (32-SS1, Milestone 849, PD-151). It runs in the Device Agent, not in Electron main: the device token and the pinned or
 * public-CA transport live only here (apps/desktop/AGENTS.md: "Owner bearer sessions and the pinned-TLS transport live in the agent"), and the
 * Agent keeps running without a desktop window, so a standby keeps pulling while nobody is signed in to the app.
 *
 * One run: `GET /standby/repositories`, then for each repository list `manifests/` (L1), `packs/` (P), `manifests/` again (L2) and `repo`; prune
 * what the Hub no longer lists (manifests first, then packs, then stale partial downloads, all strictly inside the standby folder); fetch `repo`
 * whole; fetch every missing pack in `STANDBY_RANGE_BYTES` pieces into a `.part` file (resumed from its size after an interruption) and rename it
 * into place; and only when every pack arrived, fetch the manifests of L1 AND L2, LAST (a manifest is a backup's commit point). A manifest that
 * appears only in L2 is left for the next run, because its packs may have been committed after P was listed; one that vanished between L1 and L2
 * was pruned on the Hub and is pruned here. Sizes are checked against the listing; the bytes are ciphertext and are never decrypted, and no
 * passphrase is ever asked for.
 *
 * Failure handling: 403 (no grant) idles at the slow interval; 401, 429 and other failures back off exponentially (429 at least
 * `rateLimitMinMs`); while the Hub connection is not `online` nothing is requested at all and the run waits for the connection manager, whose
 * own reconnect back-off (1 to 60 s, the realtime loop) decides when the Hub is back.
 */

export const STANDBY_DOC = 'standby-puller';
/** Piece size of one object request: bounded memory per request, below Cloudflare's body limits. */
export const STANDBY_RANGE_BYTES = 8 * 1024 * 1024;

export interface StandbyTimings {
  /** Between successful runs. */
  intervalMs: number;
  /** After a 403 (no grant): the owner has to act on the Hub first, so the puller does not keep asking. */
  noGrantIntervalMs: number;
  /** First run after the Agent starts. */
  startDelayMs: number;
  /** Exponential back-off after a failure (the same shape as the Hub connection manager's reconnect: base * 2^n plus up to 25% jitter). */
  backoffMinMs: number;
  backoffMaxMs: number;
  /** Floor after a 429. */
  rateLimitMinMs: number;
  rangeBytes: number;
  listLimit: number;
}

export const DEFAULT_STANDBY_TIMINGS: StandbyTimings = {
  intervalMs: 60 * 60_000, noGrantIntervalMs: 60 * 60_000, startDelayMs: 2 * 60_000,
  backoffMinMs: 60_000, backoffMaxMs: 30 * 60_000, rateLimitMinMs: 30_000,
  rangeBytes: STANDBY_RANGE_BYTES, listLimit: STANDBY_LIST_LIMIT_MAX,
};

/** What the puller needs of the Hub connection manager. `deviceCall` must be called with `authRetryOn403: false` (a 403 is the grant refusal). */
export interface StandbyHubPort {
  status(): Pick<AgentHubStatus, 'state'>;
  onChange(listener: (status: AgentHubStatus) => void): () => void;
  deviceCall<T>(fn: (api: HubClient, deviceToken: string) => Promise<T>, options?: { authRetryOn403?: boolean }): Promise<T>;
}

export interface StandbyPullerDeps {
  db: Db;
  now: () => Date;
  hub: StandbyHubPort;
  timings?: Partial<StandbyTimings>;
  random?: () => number;
}

export interface StandbyPuller {
  status(): AgentStandbyStatus;
  /** Starts a run now (fails `not-configured` / `not-enrolled`); answers at once. */
  pullNow(): AgentStandbyStatus;
  /** An existing absolute directory, or null to stop pulling (pulled files stay). A different folder starts a fresh mirror. */
  setFolder(folder: string | null): Promise<AgentStandbyStatus>;
  start(): void;
  stop(): void;
  /** Settles when no run is in flight (for specs and shutdown). */
  whenIdle(): Promise<void>;
}

interface StandbyDoc {
  folder: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: { code: string; message: string } | null;
  lastRunBytes: number;
  mirrorBytes: number;
  grantedAt: string | null;
  repositories: AgentStandbyRepositoryStatus[];
}

const EMPTY_DOC: StandbyDoc = { folder: null, lastAttemptAt: null, lastSuccessAt: null, lastError: null, lastRunBytes: 0, mirrorBytes: 0, grantedAt: null, repositories: [] };

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);

function parseDoc(raw: unknown): StandbyDoc {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...EMPTY_DOC };
  const r = raw as Record<string, unknown>;
  const err = r['lastError'] as { code?: unknown; message?: unknown } | null | undefined;
  const repos = Array.isArray(r['repositories']) ? r['repositories'] : [];
  return {
    folder: str(r['folder']),
    lastAttemptAt: str(r['lastAttemptAt']),
    lastSuccessAt: str(r['lastSuccessAt']),
    lastError: err && typeof err.code === 'string' && typeof err.message === 'string' ? { code: err.code, message: err.message } : null,
    lastRunBytes: count(r['lastRunBytes']),
    mirrorBytes: count(r['mirrorBytes']),
    grantedAt: str(r['grantedAt']),
    repositories: repos.flatMap((item): AgentStandbyRepositoryStatus[] => {
      if (typeof item !== 'object' || item === null) return [];
      const o = item as Record<string, unknown>;
      const id = str(o['id']);
      if (id === null || !STANDBY_DESTINATION_ID.test(id)) return [];
      return [{ id, label: str(o['label']) ?? id, lastBackupId: str(o['lastBackupId']), manifests: count(o['manifests']), packs: count(o['packs']), bytes: count(o['bytes']) }];
    }),
  };
}

/** Thrown inside a run that was superseded (folder changed, stop). Never surfaces. */
class Cancelled extends Error {}

interface RepositoryPlan {
  id: string;
  label: string;
  lastBackupId: string | null;
  paths: MirrorPaths;
  repoSize: number;
  packs: Map<string, number>;
  /** L1 AND L2: fetched last. */
  fetchManifests: Map<string, number>;
  /** L2: everything else local is pruned. */
  keepManifests: Set<string>;
}

const errnoCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^E[A-Z]+$/.test(code) ? code : null;
};

/** Maps a failure to the status error and how to retry. Messages never carry a path, a token or bytes. */
export function classifyStandbyError(error: unknown): { code: string; message: string; retry: 'no-grant' | 'backoff' | 'rate-limited' } {
  if (isHubTransferredError(error)) return { code: 'hub-transferred', message: error.message, retry: 'backoff' };
  if (error instanceof HubApiError) {
    if (error.status === 403) return { code: 'no-grant', message: 'The Hub owner has not granted this device standby access (on the Hub: dude-hub standby grant <this device id>).', retry: 'no-grant' };
    if (error.status === 401) return { code: 'unauthorized', message: 'The Hub did not accept this device\'s credentials.', retry: 'backoff' };
    if (error.status === 429) return { code: 'rate-limited', message: 'The Hub asked this device to slow down.', retry: 'rate-limited' };
    return { code: `hub-${error.code}`, message: error.message, retry: 'backoff' };
  }
  if (error instanceof HubProtocolError) return { code: 'hub-protocol', message: 'The Hub answered with an unexpected response.', retry: 'backoff' };
  if (error instanceof HubManagerError) return { code: error.code, message: error.message, retry: 'backoff' };
  if (error instanceof StandbyError) return { code: error.code, message: error.message, retry: 'backoff' };
  const errno = errnoCode(error);
  if (errno !== null) return { code: 'folder-error', message: `Writing to the standby folder failed (${errno}).`, retry: 'backoff' };
  return { code: 'internal', message: 'The standby pull failed.', retry: 'backoff' };
}

export function createStandbyPuller(deps: StandbyPullerDeps): StandbyPuller {
  const t: StandbyTimings = { ...DEFAULT_STANDBY_TIMINGS, ...deps.timings };
  const random = deps.random ?? Math.random;
  const nowIso = (): string => deps.now().toISOString();

  let started = false;
  let generation = 0;
  let running: Promise<void> | null = null;
  let due = false;
  let timer: NodeJS.Timeout | null = null;
  let nextRunAt: number | null = null;
  let attempt = 0;
  let outcome: 'no-grant' | 'backing-off' | null = null;
  let progress: AgentStandbyStatus['progress'] = null;
  let unsubscribe: (() => void) | null = null;

  const readDoc = (): StandbyDoc => parseDoc(getDoc(deps.db, STANDBY_DOC));
  const writeDoc = (doc: StandbyDoc): void => setDoc(deps.db, STANDBY_DOC, doc, deps.now);

  const hubState = (): AgentHubState => deps.hub.status().state;
  /** Why a run cannot happen now (null: it can). Read from the store and the connection every time, so a device reset or unenroll stops it. */
  const gate = (doc: StandbyDoc): AgentStandbyPhase | null => {
    if (doc.folder === null) return 'not-configured';
    const state = hubState();
    if (state === 'standalone') return 'not-enrolled';
    if (state !== 'online') return 'waiting-for-hub';
    return null;
  };

  const status = (): AgentStandbyStatus => {
    const doc = readDoc();
    const phase: AgentStandbyPhase = running !== null ? 'pulling' : gate(doc) ?? outcome ?? 'idle';
    return {
      phase, folder: doc.folder, deviceId: getMeta(deps.db, 'device_id') ?? null,
      lastAttemptAt: doc.lastAttemptAt, lastSuccessAt: doc.lastSuccessAt, nextRunAt: nextRunAt === null ? null : new Date(nextRunAt).toISOString(),
      grantedAt: doc.grantedAt, lastError: doc.lastError, lastRunBytes: doc.lastRunBytes, mirrorBytes: doc.mirrorBytes,
      repositories: doc.repositories.map((r) => ({ ...r })),
      progress: running !== null && progress !== null ? { ...progress } : null,
    };
  };

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    nextRunAt = null;
  };

  const schedule = (delayMs: number): void => {
    clearTimer();
    if (!started) return;
    nextRunAt = deps.now().getTime() + delayMs;
    timer = setTimeout(() => { timer = null; nextRunAt = null; due = true; kick(); }, delayMs);
    timer.unref?.();
  };

  const backoffDelay = (floorMs = 0): number => {
    const base = Math.min(t.backoffMaxMs, t.backoffMinMs * 2 ** attempt);
    attempt = Math.min(attempt + 1, 16);
    return Math.max(floorMs, base) + Math.floor(random() * 0.25 * base);
  };

  function kick(): void {
    if (!started || running !== null || !due) return;
    if (gate(readDoc()) !== null) return; // `due` stays set; the next `online` change runs it
    due = false;
    const gen = generation;
    running = runOnce(gen).finally(() => {
      running = null;
      progress = null;
      if (due) kick();
    });
  }

  async function runOnce(gen: number): Promise<void> {
    const startDoc = readDoc();
    const folder = startDoc.folder;
    if (folder === null) return;
    writeDoc({ ...startDoc, lastAttemptAt: nowIso() });
    progress = { objectsDone: 0, objectsTotal: 0, bytesDone: 0, bytesTotal: 0 };
    try {
      const result = await pull(folder, gen);
      if (gen !== generation) return;
      attempt = 0;
      outcome = null;
      const failure = result.failure;
      writeDoc({
        ...readDoc(), lastError: failure === null ? null : { code: failure.code, message: failure.message },
        ...(failure === null ? { lastSuccessAt: nowIso() } : {}),
        lastRunBytes: result.bytes, mirrorBytes: result.mirrorBytes, grantedAt: result.grantedAt, repositories: result.repositories,
      });
      if (failure === null) schedule(t.intervalMs);
      else { outcome = 'backing-off'; schedule(backoffDelay()); }
    } catch (error) {
      if (error instanceof Cancelled || gen !== generation) return;
      const failure = classifyStandbyError(error);
      writeDoc({ ...readDoc(), lastError: { code: failure.code, message: failure.message } });
      if (failure.retry === 'no-grant') {
        attempt = 0;
        outcome = 'no-grant';
        schedule(t.noGrantIntervalMs);
      } else {
        outcome = 'backing-off';
        schedule(backoffDelay(failure.retry === 'rate-limited' ? t.rateLimitMinMs : 0));
      }
    }
  }

  const check = (gen: number): void => { if (gen !== generation) throw new Cancelled(); };
  const device = <T>(fn: (api: HubClient, token: string) => Promise<T>): Promise<T> => deps.hub.deviceCall(fn, { authRetryOn403: false });

  /** Every object under `prefix`, validated: the right kind, a safe size, strictly ascending names, a `next` cursor that moves forward. */
  async function listAll(gen: number, id: string, prefix: StandbyObjectPrefix): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    let after: string | undefined;
    for (;;) {
      const page = await device((api, token) => api.listStandbyObjects(token, id, { prefix, ...(after === undefined ? {} : { after }), limit: t.listLimit }));
      check(gen);
      let last = after;
      for (const object of page.objects) {
        const kind = objectKind(object.name);
        const expected = prefix === 'repo' ? 'repo' : prefix === 'packs/' ? 'pack' : 'manifest';
        if (kind !== expected) throw hostile('an object');
        if (!Number.isSafeInteger(object.size) || object.size < 0) throw new StandbyError('hub-protocol', 'The Hub listed an object with an impossible size.');
        if (last !== undefined && object.name <= last) throw new StandbyError('hub-protocol', 'The Hub listing is not in order.');
        last = object.name;
        out.set(object.name, object.size);
      }
      if (page.next === null) return out;
      if (last === undefined || page.next < last || page.next === after) throw new StandbyError('hub-protocol', 'The Hub listing cursor does not advance.');
      after = page.next;
    }
  }

  async function removeFile(file: string): Promise<void> {
    try { await unlink(file); } catch (error) { if (errnoCode(error) !== 'ENOENT') throw error; }
  }

  /**
   * Downloads one object into its partial file in pieces (resuming from the partial's size when `resumable`), checks the total size against the
   * listing and every piece against its `Content-Range`, syncs, then renames it into place. Returns the bytes downloaded, or null on a 404 (the
   * object was pruned or hidden on the Hub after the listing).
   */
  async function fetchObject(gen: number, plan: RepositoryPlan, name: string, size: number, resumable: boolean): Promise<number | null> {
    const finalPath = objectPath(plan.paths, name);
    const partial = partialPath(plan.paths, name);
    await mkdir(path.dirname(partial), { recursive: true });
    let offset = 0;
    if (resumable) {
      const have = await fileSize(partial);
      if (have !== null && have <= size) offset = have;
      else if (have !== null) await removeFile(partial);
    } else {
      await removeFile(partial);
    }
    if (progress) progress.bytesDone += offset;
    const handle = await open(partial, offset === 0 ? 'w' : 'r+');
    let downloaded = 0;
    try {
      if (offset > 0) await handle.truncate(offset);
      while (offset < size) {
        const end = Math.min(size, offset + t.rangeBytes) - 1;
        const start = offset;
        let piece;
        try {
          piece = await device((api, token) => api.getStandbyObject(token, plan.id, name, { start, end }));
        } catch (error) {
          if (error instanceof HubApiError && error.status === 404) return null;
          throw error;
        }
        check(gen);
        if (piece.size !== size || piece.start !== start || piece.end !== end || piece.bytes.byteLength !== end - start + 1) {
          throw new StandbyError('size-mismatch', 'A backup object on the Hub does not have the size its listing said; it will be fetched again.');
        }
        await handle.write(piece.bytes, 0, piece.bytes.byteLength, offset);
        // Synced per piece, so the partial's size is a trustworthy resume point after a crash or power loss.
        await handle.sync();
        offset += piece.bytes.byteLength;
        downloaded += piece.bytes.byteLength;
        if (progress) progress.bytesDone += piece.bytes.byteLength;
      }
    } catch (error) {
      await handle.close().catch(() => undefined);
      // A wrong size is never resumed from.
      if (error instanceof StandbyError && error.code === 'size-mismatch') await removeFile(partial);
      throw error;
    } finally {
      // Idempotent after the close in `catch`; covers the 404 return.
      await handle.close().catch(() => undefined);
    }
    if ((await fileSize(partial)) !== size) {
      await removeFile(partial);
      throw new StandbyError('size-mismatch', 'A downloaded backup object does not have the size its listing said; it will be fetched again.');
    }
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(partial, finalPath);
    return downloaded;
  }

  async function planRepository(gen: number, folder: string, repo: { id: string; label: string; lastBackupId: string | null }): Promise<RepositoryPlan | 'missing' | 'empty'> {
    const paths = mirrorPaths(folder, repo.id);
    let first: Map<string, number>;
    let packs: Map<string, number>;
    let second: Map<string, number>;
    let repoListing: Map<string, number>;
    try {
      first = await listAll(gen, repo.id, 'manifests/');
      packs = await listAll(gen, repo.id, 'packs/');
      second = await listAll(gen, repo.id, 'manifests/');
      repoListing = await listAll(gen, repo.id, 'repo');
    } catch (error) {
      // Removed from the Hub's destinations between the repository listing and now: nothing to do this run.
      if (error instanceof HubApiError && error.status === 404) return 'missing';
      throw error;
    }
    const repoSize = repoListing.get(STANDBY_REPO_OBJECT);
    // Nothing written yet at that destination: nothing to mirror, nothing to prune.
    if (repoSize === undefined) return 'empty';
    const fetchManifests = new Map([...first].filter(([name]) => second.has(name)));
    return { id: repo.id, label: repo.label, lastBackupId: repo.lastBackupId, paths, repoSize, packs, fetchManifests, keepManifests: new Set(second.keys()) };
  }

  /** Retention prune, strictly inside this repository's mirror and partial directory: manifests first, then packs, then stale partials. */
  async function prune(plan: RepositoryPlan): Promise<void> {
    for (const name of (await listLocal(plan.paths, 'manifests')).keys()) if (!plan.keepManifests.has(name)) await removeFile(objectPath(plan.paths, name));
    for (const name of (await listLocal(plan.paths, 'packs')).keys()) if (!plan.packs.has(name)) await removeFile(objectPath(plan.paths, name));
    for (const name of await listPartials(plan.paths)) {
      if (name !== STANDBY_REPO_OBJECT && !plan.packs.has(name) && !plan.fetchManifests.has(name)) await removeFile(partialPath(plan.paths, name));
    }
  }

  async function mirrorStatus(plan: { id: string; label: string; lastBackupId: string | null; paths: MirrorPaths }): Promise<AgentStandbyRepositoryStatus> {
    const manifests = await listLocal(plan.paths, 'manifests');
    const packs = await listLocal(plan.paths, 'packs');
    const repo = (await fileSize(objectPath(plan.paths, STANDBY_REPO_OBJECT))) ?? 0;
    let bytes = repo;
    for (const size of manifests.values()) bytes += size;
    for (const size of packs.values()) bytes += size;
    return { id: plan.id, label: plan.label, lastBackupId: plan.lastBackupId, manifests: manifests.size, packs: packs.size, bytes };
  }

  async function pull(folder: string, gen: number): Promise<{
    bytes: number; mirrorBytes: number; grantedAt: string; repositories: AgentStandbyRepositoryStatus[]; failure: { code: string; message: string } | null;
  }> {
    let info;
    try { info = await stat(folder); } catch { info = null; }
    if (info === null || !info.isDirectory()) throw new StandbyError('folder-unavailable', 'The standby folder is not available (a removed drive or a deleted folder). Reconnect it or choose another folder.');
    const listing = await device((api, token) => api.standbyRepositories(token));
    check(gen);
    const seen = new Set<string>();
    for (const repo of listing.repositories) {
      if (!STANDBY_DESTINATION_ID.test(repo.id) || seen.has(repo.id)) throw hostile('a repository id');
      seen.add(repo.id);
    }

    let failure: { code: string; message: string } | null = null;
    const note = (code: string, message: string): void => { failure ??= { code, message }; };
    const plans: RepositoryPlan[] = [];
    const statuses: AgentStandbyRepositoryStatus[] = [];
    for (const repo of listing.repositories) {
      const plan = await planRepository(gen, folder, repo);
      if (plan === 'missing' || plan === 'empty') continue;
      const local = await listLocal(plan.paths, 'manifests');
      if (plan.keepManifests.size === 0 && local.size > 0) {
        // A destination that lost every backup while this standby holds some is exactly what the standby is for: keep the mirror untouched.
        note('listing-empty', `The Hub lists no backups for "${repo.label}" while this standby holds some; nothing was deleted or replaced there.`);
        statuses.push(await mirrorStatus(plan));
        continue;
      }
      plans.push(plan);
    }

    let total = 0;
    let objects = 0;
    for (const plan of plans) {
      await prune(plan);
      check(gen);
      const localPacks = await listLocal(plan.paths, 'packs');
      const localManifests = await listLocal(plan.paths, 'manifests');
      total += plan.repoSize;
      objects += 1;
      for (const [name, size] of plan.packs) if (localPacks.get(name) !== size) { total += size; objects += 1; }
      for (const [name, size] of plan.fetchManifests) if (localManifests.get(name) !== size) { total += size; objects += 1; }
    }
    if (progress) { progress.bytesTotal = total; progress.objectsTotal = objects; }

    let bytes = 0;
    const step = (n: number | null): void => { if (n !== null) bytes += n; if (progress) progress.objectsDone += 1; };
    for (const plan of plans) {
      // `repo` is re-fetched whole on every run (a few hundred bytes): a passphrase re-wrap replaces it and need not change its size.
      step(await fetchObject(gen, plan, STANDBY_REPO_OBJECT, plan.repoSize, false));
      const localPacks = await listLocal(plan.paths, 'packs');
      let packsComplete = true;
      for (const [name, size] of plan.packs) {
        if (localPacks.get(name) === size) continue;
        // A wrong-size final file (a crash between rename and nothing, or tampering) is replaced, never resumed into.
        if (localPacks.has(name)) await removeFile(objectPath(plan.paths, name));
        const got = await fetchObject(gen, plan, name, size, true);
        if (got === null) packsComplete = false;
        step(got);
      }
      if (!packsComplete) {
        // Packs vanished after the listing (a prune on the Hub): no new manifest this run, it may reference them. The next run settles it.
        note('changed-during-pull', `Backups of "${plan.label}" changed during the pull; the newest ones are fetched on the next run.`);
      } else {
        const localManifests = await listLocal(plan.paths, 'manifests');
        for (const [name, size] of plan.fetchManifests) {
          if (localManifests.get(name) === size) continue;
          if (localManifests.has(name)) await removeFile(objectPath(plan.paths, name));
          step(await fetchObject(gen, plan, name, size, true));
        }
      }
      statuses.push(await mirrorStatus(plan));
    }
    const mirrorBytes = statuses.reduce((sum, s) => sum + s.bytes, 0);
    return { bytes, mirrorBytes, grantedAt: listing.grantedAt, repositories: statuses, failure };
  }

  const onHubChange = (hub: AgentHubStatus): void => { if (hub.state === 'online') kick(); };

  return {
    status,
    pullNow() {
      const doc = readDoc();
      if (doc.folder === null) throw new StandbyError('not-configured', 'Choose a standby folder first.');
      if (hubState() === 'standalone') throw new StandbyError('not-enrolled', 'This device is not paired with a Hub.');
      due = true;
      clearTimer();
      kick();
      return status();
    },
    async setFolder(folder) {
      const doc = readDoc();
      if (folder === null) {
        generation += 1;
        due = false;
        clearTimer();
        outcome = null;
        writeDoc({ ...doc, folder: null });
        return status();
      }
      if (typeof folder !== 'string' || folder.length === 0 || folder.length > 1024 || folder.includes('\0') || !path.isAbsolute(folder)) {
        throw new StandbyError('invalid-params', 'The standby folder must be an absolute path.');
      }
      const resolved = path.resolve(folder);
      let info;
      try { info = await stat(resolved); } catch { info = null; }
      if (info === null || !info.isDirectory()) throw new StandbyError('folder-unavailable', 'The standby folder does not exist.');
      if (doc.folder === resolved) return status();
      generation += 1;
      attempt = 0;
      outcome = null;
      writeDoc({ ...EMPTY_DOC, folder: resolved });
      due = true;
      clearTimer();
      kick();
      return status();
    },
    start() {
      if (started) return;
      started = true;
      unsubscribe = deps.hub.onChange(onHubChange);
      if (readDoc().folder !== null) schedule(t.startDelayMs);
    },
    stop() {
      started = false;
      generation += 1;
      due = false;
      clearTimer();
      unsubscribe?.();
      unsubscribe = null;
    },
    whenIdle: async () => { while (running !== null) await running; },
  };
}
