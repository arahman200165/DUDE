import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AdminCallError, callAdmin, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { hubPaths } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, resolveDeps, serviceState } from './common.js';
import type { ServiceDeps } from './common.js';

/**
 * Subset of the repo's `ConsequenceClass` vocabulary (packages/domain tool-metadata model; the Hub cannot import
 * `@dude/domain`) that this action carries: it irreversibly destroys files and the database. Kept as a literal
 * tuple so the high-consequence matrix / specs can assert it.
 */
export const PURGE_CONSEQUENCE_CLASS = ['filesystem-write', 'database-write'] as const;
export const PURGE_PHRASE = 'DELETE HUB DATA';
export const PURGE_TTL_MS = 60_000;
export const purgeConfirmFile = (root: string): string => path.join(root, 'run', 'purge-confirm.json');

export interface PurgeOptions { dataDir?: string; includeBackups?: boolean; confirm?: string; type?: string }
export interface PurgeDeps extends ServiceDeps {
  /** Replaces the running check (admin reachable or service running). */
  isRunning?: (root: string) => Promise<boolean>;
  /** Replaces the read-only database count query. */
  counts?: (dbFile: string) => PurgeCounts;
  token?: () => string;
}

export interface PurgeCounts { devices: number | null; activeDevices: number | null; sessions: number | null; note?: string }
interface PurgeEntry { name: string; path: string; exists: boolean; files: number; bytes: number; listing: Array<[string, number]> }

function walk(dir: string, base: string, out: Array<[string, number]>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push([path.relative(base, full).split(path.sep).join('/'), statSync(full).size]);
  }
}

function inspect(name: string, dir: string): PurgeEntry {
  if (!existsSync(dir)) return { name, path: dir, exists: false, files: 0, bytes: 0, listing: [] };
  const listing: Array<[string, number]> = [];
  walk(dir, dir, listing);
  listing.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { name, path: dir, exists: true, files: listing.length, bytes: listing.reduce((s, [, n]) => s + n, 0), listing };
}

function targetsOf(paths: HubPaths, includeBackups: boolean): Array<[string, string]> {
  const targets: Array<[string, string]> = [['data', paths.dataDir], ['config', paths.configDir], ['storage', paths.storageDir], ['logs', paths.logsDir]];
  if (includeBackups) targets.push(['backups', paths.backupsDir]);
  return targets;
}

/** Counts from `dude.db` opened read-only; only valid while the service is stopped. */
export function readOnlyCounts(dbFile: string): PurgeCounts {
  if (!existsSync(dbFile)) return { devices: 0, activeDevices: 0, sessions: 0, note: 'No database file.' };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbFile, { readOnly: true });
    const n = (sql: string): number => Number((db!.prepare(sql).get() as { n: number }).n);
    const at = new Date().toISOString();
    return {
      devices: n('SELECT COUNT(*) AS n FROM devices'),
      activeDevices: n('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL'),
      sessions: n(`SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND idle_expires_at > '${at}' AND absolute_expires_at > '${at}'`),
    };
  } catch (error) {
    return { devices: null, activeDevices: null, sessions: null, note: `The database could not be read: ${(error as Error).message}` };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest();
const safeEqual = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

function preview(root: string, includeBackups: boolean, counts: PurgeCounts, includeListing = false) {
  const paths = hubPaths(root);
  const entries = targetsOf(paths, includeBackups).map(([name, dir]) => inspect(name, dir));
  const digest = createHash('sha256')
    .update(JSON.stringify({ root, includeBackups, entries: entries.map((e) => [e.name, e.exists, e.listing]), counts: [counts.devices, counts.activeDevices, counts.sessions] }))
    .digest('hex');
  return {
    digest,
    entries,
    summary: entries.map((e) => ({ name: e.name, path: e.path, exists: e.exists, files: e.files, bytes: e.bytes, ...(includeListing ? { listing: e.listing } : {}) })),
  };
}

async function defaultIsRunning(root: string, d: ReturnType<typeof resolveDeps>): Promise<boolean> {
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'stopped') return true; // running, pending, paused or unknown: refuse
  try {
    await callAdmin(root, 'status', {}, 2000);
    return true;
  } catch (error) {
    return !(error instanceof AdminCallError && error.code === HUB_NOT_RUNNING);
  }
}

function looksLikeHubRoot(root: string): boolean {
  const paths = hubPaths(root);
  return existsSync(paths.dbFile) || existsSync(paths.configFile);
}

interface StoredConfirm { tokenHash?: unknown; digest?: unknown; expiresAt?: unknown }

function readStored(file: string): StoredConfirm | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as StoredConfirm; } catch { return null; }
}

const stamp = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/**
 * `dude-hub purge --data-dir <dir>`: deletes Hub data under the Destructive-Action Contract.
 * Phase 1 (no `--confirm`) previews and issues a single-use, 60-second token bound to the preview digest; nothing changes.
 * Phase 2 (`--confirm <token> --type "DELETE HUB DATA"`) recomputes the digest and refuses if anything changed.
 * Consequence classes: see PURGE_CONSEQUENCE_CLASS. The Hub must be stopped; the database is only ever opened read-only.
 */
export async function runPurge(options: PurgeOptions, deps: PurgeDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const now = d.now;
  if (!options.dataDir?.trim()) {
    d.err('purge needs an explicit --data-dir <dir>; it never falls back to a default location.\n');
    return EXIT_USAGE;
  }
  const root = path.resolve(options.dataDir);
  if (path.parse(root).root === root || root.split(path.sep).filter(Boolean).length < 2) {
    d.err('Refusing to purge a drive root or a top-level directory.\n');
    return EXIT_USAGE;
  }
  if (!looksLikeHubRoot(root)) {
    d.err(`${root} does not look like a Hub data directory (no config/hub.json or data/dude.db).\n`);
    return EXIT_USAGE;
  }
  const running = await (deps.isRunning ? deps.isRunning(root) : defaultIsRunning(root, d));
  if (running) {
    d.err('The Hub is running (or its service is not stopped). Stop it first with "dude-hub service stop"; purge refuses to run against a live Hub.\n');
    return EXIT_FAILURE;
  }
  const includeBackups = options.includeBackups === true;
  const counts = (deps.counts ?? readOnlyCounts)(hubPaths(root).dbFile);
  const current = preview(root, includeBackups, counts);
  const confirmFile = purgeConfirmFile(root);

  if (options.confirm === undefined) {
    const token = deps.token ? deps.token() : randomBytes(32).toString('base64url');
    const expiresAt = now() + PURGE_TTL_MS;
    mkdirSync(path.dirname(confirmFile), { recursive: true });
    const temp = `${confirmFile}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ v: 1, tokenHash: sha256(token).toString('hex'), digest: current.digest, expiresAt, includeBackups })}\n`);
    renameSync(temp, confirmFile);
    d.out(json({
      previewOnly: true,
      consequenceClass: PURGE_CONSEQUENCE_CLASS,
      willDelete: current.summary,
      counts,
      backupsKept: !includeBackups,
      confirmToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
      next: `dude-hub purge --data-dir "${root}"${includeBackups ? ' --include-backups' : ''} --confirm <confirmToken> --type "${PURGE_PHRASE}"`,
    }));
    d.err('Nothing was deleted. This cannot be undone. Re-run the command shown in "next" within 60 seconds to proceed.\n');
    return EXIT_OK;
  }

  // Phase 2.
  if (options.type === undefined || options.type !== PURGE_PHRASE) {
    d.err(`Confirmation refused: pass --type "${PURGE_PHRASE}" exactly. Nothing was deleted.\n`);
    return EXIT_FAILURE;
  }
  const stored = readStored(confirmFile);
  rmSync(confirmFile, { force: true }); // single use: consumed by any attempt that reaches this point
  if (stored === null) {
    d.err('Confirmation refused: there is no pending preview. Run purge without --confirm first. Nothing was deleted.\n');
    return EXIT_FAILURE;
  }
  if (typeof stored.expiresAt !== 'number' || stored.expiresAt < now()) {
    d.err('Confirmation refused: the token expired. Run the preview again. Nothing was deleted.\n');
    return EXIT_FAILURE;
  }
  if (typeof stored.tokenHash !== 'string' || !safeEqual(stored.tokenHash, sha256(options.confirm).toString('hex'))) {
    d.err('Confirmation refused: the token is not valid. Run the preview again. Nothing was deleted.\n');
    return EXIT_FAILURE;
  }
  if (typeof stored.digest !== 'string' || stored.digest !== current.digest) {
    d.err('Confirmation refused: the data changed since the preview. Run the preview again. Nothing was deleted.\n');
    return EXIT_FAILURE;
  }

  const removed: Array<{ name: string; path: string; files: number; bytes: number }> = [];
  const problems: string[] = [];
  for (const entry of current.entries) {
    if (!entry.exists) continue;
    try {
      rmSync(entry.path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      removed.push({ name: entry.name, path: entry.path, files: entry.files, bytes: entry.bytes });
    } catch (error) {
      problems.push(`${entry.name}: ${(error as Error).message}`);
    }
  }
  const at = now();
  const logFile = path.join(root, `purge-${stamp(at)}.log`);
  try {
    appendFileSync(
      logFile,
      `${new Date(at).toISOString()} purge ${problems.length === 0 ? 'completed' : 'incomplete'} removed=${removed.map((r) => `${r.name}(${r.files} files, ${r.bytes} bytes)`).join(',') || 'none'} includeBackups=${includeBackups} devices=${counts.devices ?? 'unknown'}${problems.length ? ` problems=${problems.join(' | ')}` : ''}\n`,
    );
  } catch { /* the purge itself already ran; the printed result is the record */ }
  d.out(json({ purged: problems.length === 0, removed, backupsKept: !includeBackups, ...(problems.length ? { problems } : {}), log: logFile }));
  return problems.length === 0 ? EXIT_OK : EXIT_FAILURE;
}
