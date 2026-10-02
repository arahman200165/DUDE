import { app, ipcMain, Notification, powerMonitor, type WebContents } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs, watch, type FSWatcher } from 'node:fs';
import { join, sep } from 'node:path';
import type { FsResult } from "@dude/contracts/fs/fs-types";
import type { ChangeEvent, FolderWatchSettings, FolderWatchState, TimelineQuery, WatchedFolder, WatchedFolderStatus } from "@dude/contracts/fs/watch-types";
import { createPathFilter, DEFAULT_WALK_OPTIONS } from "@dude/tool-engine/shared/fs/walk-filter";
import { isProbablyBinary } from "@dude/tool-engine/shared/fs/text-normalize";
import { isRemembered, isRootGranted, normalizeRoot, onRootForgotten, resolveInRoot } from './fs-grants';
import { onPlanApplying } from './fs-mutation';
import { classify, isNoise, shouldNotify, summarize, type RawObservation } from './fs-watch-logic';

/**
 * Watched Folders & Change Timeline (DUDE_PRD.md §21 Phase 29 items 10 and 13, Milestone 534) —
 * background folder watching while DUDE runs (window open or hidden to the tray), following the
 * Certificate Watch List's pattern: opt-in globally, main-process state in userData, rate-limited
 * notifications, a tray summary, and no launch-on-login or service. Only *remembered* folders can be
 * watched, so a background watch never outlives the user's explicit persistent grant; forgetting a
 * folder stops its watch. Content capture is a separate per-folder opt-in that keeps copies of changed
 * files (content-addressed, deduplicated) in DUDE's app data — deliberately without size, type or
 * secret limits, per the Phase 29 decision; storage is shown and clearable. DUDE's own batch
 * operations are tagged and coalesced instead of alerting.
 */

const MAX_FOLDERS = 20;
const MAX_EVENTS = 10_000;
const COALESCE_MS = 350;
const DEFAULT_SETTINGS: FolderWatchSettings = { enabled: false, notifyEveryMinutes: 5 };

interface Runtime {
  watcher: FSWatcher | null;
  pending: Map<string, { renamed: boolean }>;
  timer: NodeJS.Timeout | null;
  known: Map<string, { size: number; mtimeMs: number; isDir: boolean }>;
  lastContent: Map<string, string>;
  events: ChangeEvent[];
  seq: number;
  lastNotifiedAt?: number;
  unnotified: number;
  dirty: boolean;
  error?: string;
  contentBytes: number;
  filter: ReturnType<typeof createPathFilter>;
}

let settings: FolderWatchSettings = DEFAULT_SETTINGS;
let folders: WatchedFolder[] = [];
const runtimes = new Map<string, Runtime>();
const dudePlans = new Map<string, { paths: string[]; until: number }>();
let subscribers: WebContents[] = [];
let broadcastTimer: NodeJS.Timeout | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let trayUpdater: ((summary: { folders: number; changesToday: number }) => void) | null = null;

export function setFolderWatchTrayUpdater(updater: (summary: { folders: number; changesToday: number }) => void): void { trayUpdater = updater; }

function userData(): string { return app.getPath('userData'); }
function statePath(): string { return join(userData(), 'watched-folders.json'); }
function timelinePath(id: string): string { return join(userData(), 'watch-timeline', `${id}.json`); }
function contentDir(id: string): string { return join(userData(), 'watch-content', id); }

// ---- Persistence ----

async function writeJson(path: string, value: unknown): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(`${path}.tmp`, JSON.stringify(value), 'utf8');
  await fs.rename(`${path}.tmp`, path);
}

async function saveState(): Promise<void> { await writeJson(statePath(), { settings, folders }); }

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    for (const [id, runtime] of runtimes) if (runtime.dirty) { runtime.dirty = false; void writeJson(timelinePath(id), runtime.events).catch(() => {}); }
  }, 2000);
}

function sanitizeFolder(raw: Partial<WatchedFolder>, fallback?: WatchedFolder): WatchedFolder {
  const base = fallback ?? { id: randomUUID(), path: '', label: '', enabled: true, notify: false, captureContent: false, exclude: [], addedAt: new Date().toISOString() };
  return {
    ...base,
    ...(typeof raw.label === 'string' ? { label: raw.label.slice(0, 120) } : {}),
    ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
    ...(typeof raw.notify === 'boolean' ? { notify: raw.notify } : {}),
    ...(typeof raw.captureContent === 'boolean' ? { captureContent: raw.captureContent } : {}),
    ...(Array.isArray(raw.exclude) ? { exclude: raw.exclude.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 256)).slice(0, 100) } : {}),
  };
}

// ---- Watching ----

function runtimeFor(folder: WatchedFolder): Runtime {
  let runtime = runtimes.get(folder.id);
  if (!runtime) {
    runtime = { watcher: null, pending: new Map(), timer: null, known: new Map(), lastContent: new Map(), events: [], seq: 0, unnotified: 0, dirty: false, contentBytes: 0, filter: createPathFilter({ ...DEFAULT_WALK_OPTIONS, useGitignore: false, exclude: folder.exclude }) };
    runtimes.set(folder.id, runtime);
  }
  return runtime;
}

function push(folder: WatchedFolder, runtime: Runtime, event: Omit<ChangeEvent, 'seq' | 'at'>): ChangeEvent {
  const full: ChangeEvent = { ...event, seq: ++runtime.seq, at: new Date().toISOString() };
  runtime.events.push(full);
  if (runtime.events.length > MAX_EVENTS) runtime.events.splice(0, runtime.events.length - MAX_EVENTS);
  runtime.dirty = true;
  scheduleSave();
  scheduleBroadcast();
  return full;
}

async function statOf(path: string): Promise<{ size: number; mtimeMs: number; isDir: boolean } | null> {
  try { const info = await fs.lstat(path); return { size: info.isDirectory() ? 0 : info.size, mtimeMs: info.mtimeMs, isDir: info.isDirectory() }; } catch { return null; }
}

/** Streams a changed file into the folder's content store (deduplicated by SHA-256). */
async function capture(folder: WatchedFolder, runtime: Runtime, absolute: string): Promise<string | undefined> {
  const dir = contentDir(folder.id);
  await fs.mkdir(dir, { recursive: true });
  const temp = join(dir, `.incoming-${randomUUID()}`);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(temp);
      const input = createReadStream(absolute);
      input.on('data', (chunk) => { hash.update(chunk as Buffer); bytes += (chunk as Buffer).length; });
      input.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => resolve());
      input.pipe(out);
    });
    const digest = hash.digest('hex');
    const target = join(dir, digest);
    if (await statOf(target)) await fs.rm(temp, { force: true });
    else { await fs.rename(temp, target); runtime.contentBytes += bytes; }
    return digest;
  } catch {
    await fs.rm(temp, { force: true }).catch(() => {});
    return undefined;
  }
}

function inDudePlan(absolute: string): string | undefined {
  const now = Date.now();
  const key = absolute.toLowerCase();
  for (const [planId, plan] of dudePlans) {
    if (plan.until < now) { dudePlans.delete(planId); continue; }
    if (plan.paths.some((path) => key === path || key.startsWith(path + sep) || path.startsWith(key + sep))) return planId;
  }
  return undefined;
}

async function flush(folder: WatchedFolder, runtime: Runtime): Promise<void> {
  runtime.timer = null;
  const batch = [...runtime.pending];
  runtime.pending.clear();
  const observations: RawObservation[] = [];
  const planCounts = new Map<string, number>();
  for (const [path, { renamed }] of batch) {
    const absolute = resolveInRoot(folder.path, path);
    if (!absolute) continue;
    const planId = inDudePlan(absolute);
    const now = await statOf(absolute);
    const known = runtime.known.get(path) ?? null;
    if (now) runtime.known.set(path, now); else runtime.known.delete(path);
    if (planId) { planCounts.set(planId, (planCounts.get(planId) ?? 0) + 1); continue; }
    observations.push({ path, now, known, renamed });
  }
  for (const [planId, count] of planCounts) push(folder, runtime, { kind: 'dude', path: '', planId, count, message: `DUDE batch operation changed ${count} path(s)` });
  const classified = classify(observations);
  for (const event of classified) {
    let extra: Partial<ChangeEvent> = {};
    if (folder.captureContent && (event.kind === 'created' || event.kind === 'modified' || event.kind === 'renamed') && !event.isDir) {
      const absolute = resolveInRoot(folder.path, event.path);
      const after = absolute ? await capture(folder, runtime, absolute) : undefined;
      const before = runtime.lastContent.get(event.from ?? event.path);
      if (after) { runtime.lastContent.set(event.path, after); extra = { after, ...(before && event.kind !== 'created' ? { before } : {}) }; }
      if (event.from) runtime.lastContent.delete(event.from);
    }
    push(folder, runtime, { ...event, ...extra });
  }
  if (classified.length && folder.notify) {
    runtime.unnotified += classified.length;
    const now = Date.now();
    if (shouldNotify(runtime.lastNotifiedAt, now, settings.notifyEveryMinutes) && Notification.isSupported()) {
      runtime.lastNotifiedAt = now;
      new Notification({ title: `${folder.label || folder.path}: ${runtime.unnotified} change(s)`, body: summarize(classified) }).show();
      runtime.unnotified = 0;
    }
  }
}

function start(folder: WatchedFolder): void {
  const runtime = runtimeFor(folder);
  if (runtime.watcher || !settings.enabled || !folder.enabled) return;
  if (!isRemembered(folder.path) || !isRootGranted(folder.path)) { runtime.error = 'Remember this folder (and make sure it exists) to watch it.'; return; }
  try {
    const watcher = watch(folder.path, { recursive: true }, (eventType, filename) => {
      if (!filename) {
        // Windows drops individual events when its change buffer overflows.
        push(folder, runtime, { kind: 'gap', path: '', message: 'Too many changes at once — some were not reported. Rescan to be sure.' });
        return;
      }
      const path = String(filename).split(sep).join('/');
      if (isNoise(path, (relative, name) => runtime.filter.excluded(relative, name))) return;
      const pending = runtime.pending.get(path);
      runtime.pending.set(path, { renamed: (pending?.renamed ?? false) || eventType === 'rename' });
      if (!runtime.timer) runtime.timer = setTimeout(() => void flush(folder, runtime), COALESCE_MS);
    });
    watcher.on('error', (error) => { runtime.error = error.message; stop(folder.id); scheduleBroadcast(); });
    runtime.watcher = watcher;
    runtime.error = undefined;
    void baseline(folder, runtime);
  } catch (error) { runtime.error = error instanceof Error ? error.message : String(error); }
}

const BASELINE_LIMIT = 100_000;

/**
 * Records the sizes of up to 100,000 existing entries when a watch starts, so the first rename or
 * deletion of a pre-existing file can be classified by size instead of guessed. Paths already
 * reported by an event are left alone; excluded folders are never entered.
 */
async function baseline(folder: WatchedFolder, runtime: Runtime): Promise<void> {
  const stack = [''];
  let seen = 0;
  while (stack.length && seen < BASELINE_LIMIT && runtime.watcher) {
    const relative = stack.pop()!;
    const absolute = relative ? resolveInRoot(folder.path, relative) : folder.path;
    if (!absolute) continue;
    const children = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const path = relative ? `${relative}/${child.name}` : child.name;
      if (isNoise(path, (candidate, name) => runtime.filter.excluded(candidate, name)) || runtime.known.has(path)) continue;
      if (child.isDirectory()) { runtime.known.set(path, { size: 0, mtimeMs: 0, isDir: true }); stack.push(path); }
      else if (child.isFile()) {
        const info = await statOf(join(absolute, child.name));
        if (info && !runtime.known.has(path)) runtime.known.set(path, info);
      }
      if (++seen >= BASELINE_LIMIT) break;
    }
  }
}

function stop(id: string): void {
  const runtime = runtimes.get(id);
  if (!runtime) return;
  runtime.watcher?.close();
  runtime.watcher = null;
  if (runtime.timer) clearTimeout(runtime.timer);
  runtime.timer = null;
}

function restartAll(): void {
  for (const folder of folders) { stop(folder.id); start(folder); }
  scheduleBroadcast();
}

// ---- State for the renderer ----

async function dirBytes(path: string): Promise<number> {
  const names = await fs.readdir(path).catch(() => [] as string[]);
  let total = 0;
  for (const name of names) total += (await fs.stat(join(path, name)).catch(() => ({ size: 0 }))).size;
  return total;
}

export function stateSnapshot(): FolderWatchState {
  return {
    settings,
    folders: folders.map((folder): WatchedFolderStatus => {
      const runtime = runtimes.get(folder.id);
      return { ...folder, active: !!runtime?.watcher, available: isRootGranted(folder.path), events: runtime?.events.length ?? 0, lastEventAt: runtime?.events.at(-1)?.at, contentBytes: runtime?.contentBytes ?? 0, ...(runtime?.error ? { error: runtime.error } : {}) };
    }),
  };
}

function scheduleBroadcast(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    subscribers = subscribers.filter((contents) => !contents.isDestroyed());
    const state = stateSnapshot();
    for (const contents of subscribers) contents.send('dude:fswatch:changed', state);
    const today = new Date().toISOString().slice(0, 10);
    const changesToday = [...runtimes.values()].reduce((sum, runtime) => sum + runtime.events.filter((event) => event.at.startsWith(today) && event.kind !== 'dude').length, 0);
    trayUpdater?.({ folders: state.folders.filter((folder) => folder.active).length, changesToday });
  }, 500);
}

export function queryTimeline(query: TimelineQuery): ChangeEvent[] {
  const runtime = runtimes.get(query.folderId);
  if (!runtime) return [];
  const text = query.text?.trim().toLowerCase();
  const kinds = query.kinds?.length ? new Set(query.kinds) : null;
  const limit = Math.min(5000, Math.max(1, query.limit ?? 500));
  const out: ChangeEvent[] = [];
  for (let index = runtime.events.length - 1; index >= 0 && out.length < limit; index--) {
    const event = runtime.events[index];
    if (query.beforeSeq !== undefined && event.seq >= query.beforeSeq) continue;
    if (kinds && !kinds.has(event.kind)) continue;
    if (text && !`${event.path} ${event.from ?? ''}`.toLowerCase().includes(text)) continue;
    out.push(event);
  }
  return out;
}

// ---- Lifecycle ----

export async function loadFolderWatches(): Promise<void> {
  try {
    const raw = JSON.parse(await fs.readFile(statePath(), 'utf8')) as { settings?: Partial<FolderWatchSettings>; folders?: WatchedFolder[] };
    settings = { ...DEFAULT_SETTINGS, ...raw.settings };
    folders = (raw.folders ?? []).filter((folder) => typeof folder?.path === 'string').slice(0, MAX_FOLDERS).map((folder) => ({ ...sanitizeFolder(folder, { ...folder, exclude: folder.exclude ?? [] }), id: folder.id, path: normalizeRoot(folder.path) }));
  } catch { settings = DEFAULT_SETTINGS; folders = []; }
  for (const folder of folders) {
    const runtime = runtimeFor(folder);
    try { runtime.events = JSON.parse(await fs.readFile(timelinePath(folder.id), 'utf8')) as ChangeEvent[]; runtime.seq = runtime.events.at(-1)?.seq ?? 0; } catch { runtime.events = []; }
    runtime.contentBytes = await dirBytes(contentDir(folder.id));
  }
  restartAll();
}

export function stopFolderWatches(): void {
  for (const folder of folders) stop(folder.id);
  for (const [id, runtime] of runtimes) if (runtime.dirty) void writeJson(timelinePath(id), runtime.events).catch(() => {});
}

function wrap<T>(action: () => Promise<T> | T): Promise<FsResult<{ value: T }>> {
  return Promise.resolve().then(action).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
}

export function registerFolderWatchHandlers(): void {
  onPlanApplying(
    (planId, paths) => { dudePlans.set(planId, { paths: paths.map((path) => path.toLowerCase()), until: Number.MAX_SAFE_INTEGER }); },
    (planId) => { const plan = dudePlans.get(planId); if (plan) plan.until = Date.now() + 3000; },
  );
  onRootForgotten((path) => {
    const key = path.toLowerCase();
    for (const folder of folders) if (folder.path.toLowerCase() === key) { stop(folder.id); runtimeFor(folder).error = 'This folder was forgotten, so it is no longer watched.'; }
    scheduleBroadcast();
  });
  powerMonitor.on('resume', () => {
    for (const folder of folders) if (runtimes.get(folder.id)?.watcher) push(folder, runtimeFor(folder), { kind: 'gap', path: '', message: 'The computer was asleep; changes during sleep may not be listed.' });
    restartAll();
  });

  ipcMain.handle('dude:fswatch:get', (event) => wrap(() => {
    if (!subscribers.includes(event.sender)) subscribers.push(event.sender);
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:add', (_event, path: unknown, raw: unknown) => wrap(async () => {
    if (typeof path !== 'string' || !isRootGranted(path)) throw new Error('Pick this folder with the native picker first.');
    if (!isRemembered(path)) throw new Error('Remember this folder first — only remembered folders can be watched in the background.');
    const key = normalizeRoot(path);
    if (folders.some((folder) => folder.path.toLowerCase() === key.toLowerCase())) throw new Error('This folder is already watched.');
    if (folders.length >= MAX_FOLDERS) throw new Error(`At most ${MAX_FOLDERS} folders can be watched.`);
    const folder = { ...sanitizeFolder((raw ?? {}) as Partial<WatchedFolder>), path: key };
    folders.push({ ...folder, label: folder.label || key.split(sep).pop() || key });
    await saveState();
    start(folders[folders.length - 1]);
    scheduleBroadcast();
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:update', (_event, id: unknown, raw: unknown) => wrap(async () => {
    const index = folders.findIndex((folder) => folder.id === id);
    if (index < 0) throw new Error('Unknown watched folder.');
    folders[index] = sanitizeFolder((raw ?? {}) as Partial<WatchedFolder>, folders[index]);
    runtimeFor(folders[index]).filter = createPathFilter({ ...DEFAULT_WALK_OPTIONS, useGitignore: false, exclude: folders[index].exclude });
    await saveState();
    stop(folders[index].id);
    start(folders[index]);
    scheduleBroadcast();
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:remove', (_event, id: unknown) => wrap(async () => {
    const folder = folders.find((item) => item.id === id);
    if (!folder) throw new Error('Unknown watched folder.');
    stop(folder.id);
    runtimes.delete(folder.id);
    folders = folders.filter((item) => item.id !== id);
    await saveState();
    await fs.rm(timelinePath(folder.id), { force: true });
    await fs.rm(contentDir(folder.id), { recursive: true, force: true });
    scheduleBroadcast();
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:setSettings', (_event, raw: unknown) => wrap(async () => {
    const patch = (raw ?? {}) as Partial<FolderWatchSettings>;
    settings = {
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : settings.enabled,
      notifyEveryMinutes: Number.isFinite(patch.notifyEveryMinutes) ? Math.min(1440, Math.max(1, Math.round(Number(patch.notifyEveryMinutes)))) : settings.notifyEveryMinutes,
    };
    await saveState();
    if (!settings.enabled) for (const folder of folders) stop(folder.id);
    restartAll();
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:timeline', (_event, query: unknown) => wrap(() => queryTimeline((query ?? {}) as TimelineQuery)));
  ipcMain.handle('dude:fswatch:clearTimeline', (_event, id: unknown) => wrap(async () => {
    const runtime = runtimes.get(String(id));
    if (runtime) { runtime.events = []; runtime.dirty = true; scheduleSave(); scheduleBroadcast(); }
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:clearContent', (_event, id: unknown) => wrap(async () => {
    const runtime = runtimes.get(String(id));
    await fs.rm(contentDir(String(id)), { recursive: true, force: true });
    if (runtime) { runtime.contentBytes = 0; runtime.lastContent.clear(); }
    scheduleBroadcast();
    return stateSnapshot();
  }));
  ipcMain.handle('dude:fswatch:content', (_event, id: unknown, hash: unknown) => wrap(async () => {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || typeof id !== 'string' || !folders.some((folder) => folder.id === id)) throw new Error('Unknown content.');
    const path = join(contentDir(id), hash);
    const info = await fs.stat(path);
    if (info.size > 5 * 1024 * 1024) return { size: info.size, text: null as string | null, binary: false };
    const bytes = await fs.readFile(path);
    return isProbablyBinary(bytes) ? { size: info.size, text: null, binary: true } : { size: info.size, text: bytes.toString('utf8'), binary: false };
  }));
}
