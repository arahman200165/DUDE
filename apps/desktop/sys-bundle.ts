import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { createWriteStream, promises as fs, type WriteStream } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';
import { cpuPercents, processKey } from "@dude/tool-engine/shared/system/cpu-delta";
import { ancestorsOf, buildProcessForest, descendantsOf } from "@dude/tool-engine/shared/system/process-tree";
import {
  BUNDLE_LIMITS, BUNDLE_SECTIONS, BUNDLE_SECTION_IDS, HANDLES_NEED_ELEVATION, estimateSections,
  type BundleCounts, type BundleEstimate, type BundleManifest, type BundleManifestSection, type BundleOptions, type BundleProgress,
  type BundleResult, type BundleSectionId, type BundleToggles, type BundleWriteRequest, type BundleWriteResult,
} from "@dude/contracts/system/bundle-types";
import type {
  EventQueryResult, EventRecord, FileSignatureResult, FileVersionResult, HelperInfo, ProcessDetail, ProcessListResult, ProcessModulesResult,
  ProcessSummary, ProcessThreadsResult, ProcessHandlesResult, SocketTableResult, SysResult,
} from "@dude/contracts/system/system-types";
import { consumeSavePath } from './fs-grants';
import { sysHelper } from './sys-helper';

/**
 * Process Diagnostic Bundle writer (DUDE_PRD.md §21 Phase 31, Milestone 613). Main re-collects every
 * section itself from the system helper: the renderer only names a process instance (`pid` + `startKey`),
 * which sections to include, two small options and the path the native save dialog returned. That path is
 * a single-use write grant (`fs-grants`); without it nothing is written. The ZIP is streamed to disk with
 * fflate, and the minidump is written by the helper to a private staging file that is streamed into the
 * ZIP (stored, not compressed) and deleted afterwards, success or failure. The dump is never held in memory
 * and never reaches the renderer.
 *
 * Why the dump calls the helper directly instead of the `process.dump` mutation op: that op writes to an
 * arbitrary user path and so goes through plan, typed confirm and journal. Here the dump target is a
 * private staging file that is deleted right after, and the consent is the explicit Export click plus the
 * native save dialog (both needed before any collection starts). The renderer still has no way to reach
 * `proc.dump`: it is not in `SYS_READ_METHODS` and this module accepts no dump path from the renderer.
 */

const PROGRESS_CHANNEL = 'dude:sys-bundle:progress';
const EXPORT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_PID = 0xffffffff;
const MAX_MODULE_INFO = 400;
const MODULE_INFO_CONCURRENCY = 6;
const MAX_EVENTS = 500;
const DUMP_TIMEOUT_MS = 15 * 60_000;
const READ_CHUNK = 1024 * 1024;
const CANCELLED = 'Export cancelled.';
const GONE = 'The process exited or its PID was reused. Choose it again.';

// ---- helper access ------------------------------------------------------------------------------

interface HelperError extends Error { code?: number }

async function read<T>(method: string, params: object, timeoutMs?: number): Promise<T> {
  const result: SysResult<unknown> = await sysHelper().call(method, params, timeoutMs);
  if (!result.ok) {
    const error: HelperError = new Error(result.error);
    if (result.code !== undefined) error.code = result.code;
    throw error;
  }
  return result.data as T;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function isElevated(): Promise<boolean> {
  try { return (await read<HelperInfo>('helper.info', {})).elevated === true; } catch { return false; }
}

interface Located { readonly listing: ProcessListResult; readonly summary: ProcessSummary }

/** Verifies `pid` + `startKey` is still one live process instance; a reused PID never matches. */
async function locate(pid: number, startKey: string): Promise<Located> {
  const listing = await read<ProcessListResult>('process.list', {});
  const summary = listing.processes.find((p) => p.pid === pid && p.startKey === startKey);
  if (!summary) throw new Error(GONE);
  return { listing, summary };
}

// ---- validation ---------------------------------------------------------------------------------

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateRef(raw: Record<string, unknown>): { pid: number; startKey: string } {
  const { pid, startKey } = raw;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0 || pid > MAX_PID) throw new Error('Invalid process id.');
  if (typeof startKey !== 'string' || !/^[0-9]{1,20}$/.test(startKey)) throw new Error('Invalid process start key.');
  return { pid, startKey };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function validateOptions(raw: unknown): BundleOptions {
  const o = isPlain(raw) ? raw : {};
  return {
    eventHours: clampInt(o['eventHours'], BUNDLE_LIMITS.eventHoursMin, BUNDLE_LIMITS.eventHoursMax, BUNDLE_LIMITS.eventHoursDefault),
    sampleSeconds: clampInt(o['sampleSeconds'], BUNDLE_LIMITS.sampleSecondsMin, BUNDLE_LIMITS.sampleSecondsMax, BUNDLE_LIMITS.sampleSecondsDefault),
    fullDump: o['fullDump'] === true,
  };
}

export function validateWriteRequest(raw: unknown): BundleWriteRequest {
  if (!isPlain(raw)) throw new Error('Invalid export request.');
  const ref = validateRef(raw);
  const exportId = raw['exportId'];
  if (typeof exportId !== 'string' || !EXPORT_ID.test(exportId)) throw new Error('Invalid export id.');
  const toggles = raw['sections'];
  if (!isPlain(toggles)) throw new Error('Invalid section selection.');
  const sections = Object.fromEntries(BUNDLE_SECTION_IDS.map((id) => [id, toggles[id] === true])) as Record<BundleSectionId, boolean>;
  if (!BUNDLE_SECTION_IDS.some((id) => sections[id])) throw new Error('Select at least one section.');
  const savePath = raw['savePath'];
  if (typeof savePath !== 'string' || savePath.length > 1024 || /[\u0000-\u001f]/.test(savePath) || !isAbsolute(savePath)) throw new Error('Choose where to save the bundle first.');
  return { ...ref, exportId, sections, options: validateOptions(raw['options']), savePath };
}

// ---- estimate -----------------------------------------------------------------------------------

async function attempt<T>(action: () => Promise<T>): Promise<T | null> {
  try { return await action(); } catch { return null; }
}

export async function estimateBundle(rawRequest: unknown): Promise<BundleEstimate> {
  if (!isPlain(rawRequest)) throw new Error('Invalid estimate request.');
  const ref = validateRef(rawRequest);
  const options = validateOptions(rawRequest['options']);
  const [{ listing, summary }, elevated] = await Promise.all([locate(ref.pid, ref.startKey), isElevated()]);
  const [detail, modules, threads, tcp, udp] = await Promise.all([
    attempt(() => read<ProcessDetail>('process.detail', ref)),
    attempt(() => read<ProcessModulesResult>('process.modules', ref)),
    attempt(() => read<ProcessThreadsResult>('process.threads', { pid: ref.pid })),
    attempt(() => read<SocketTableResult>('net.tcp', {})),
    attempt(() => read<SocketTableResult>('net.udp', {})),
  ]);
  const forest = buildProcessForest(listing.processes);
  const key = processKey(summary);
  const env = detail?.environment ?? {};
  const counts: BundleCounts = {
    treeNodes: ancestorsOf(forest, key).length + descendantsOf(forest, key).length + 1,
    commandLineChars: detail?.commandLine?.length ?? 0,
    envBytes: Object.entries(env).reduce((sum, [name, value]) => sum + name.length + value.length + 8, 0),
    modules: modules?.modules.length ?? 0,
    threads: threads?.threads.length ?? summary.threadCount,
    handles: summary.handleCount,
    ports: [...(tcp?.entries ?? []), ...(udp?.entries ?? [])].filter((s) => s.pid === ref.pid).length,
    privateBytes: summary.privateBytes,
    workingSetBytes: summary.workingSetBytes,
  };
  return { target: { pid: ref.pid, startKey: ref.startKey, name: summary.name }, elevated, counts, sections: estimateSections(counts, options, elevated) };
}

// ---- section collectors -------------------------------------------------------------------------

interface Collected { readonly json?: unknown; readonly text?: string; readonly status?: 'ok' | 'skipped'; readonly note?: string }
interface CollectContext {
  readonly ref: { pid: number; startKey: string };
  readonly summary: ProcessSummary;
  readonly listing: ProcessListResult;
  readonly elevated: boolean;
  readonly options: BundleOptions;
  readonly signal: AbortSignal;
  onSample(done: number, total: number): void;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(CANCELLED);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
  });
}

async function collectTarget(ctx: CollectContext): Promise<Collected> {
  const detail = await read<ProcessDetail>('process.detail', ctx.ref);
  const { environment: _environment, commandLine: _commandLine, ...rest } = detail;
  return { json: { summary: ctx.summary, detail: rest, sampledAtMs: ctx.listing.sampledAtMs, logicalProcessors: ctx.listing.logicalProcessors, dudeElevated: ctx.elevated } };
}

async function collectTree(ctx: CollectContext): Promise<Collected> {
  const forest = buildProcessForest(ctx.listing.processes);
  const key = processKey(ctx.summary);
  const brief = (p: ProcessSummary) => ({ pid: p.pid, parentPid: p.parentPid, name: p.name, startKey: p.startKey, createTimeMs: p.createTimeMs });
  return { json: { target: brief(ctx.summary), ancestors: ancestorsOf(forest, key).map(brief), descendants: descendantsOf(forest, key).map(brief) } };
}

async function collectCommandLine(ctx: CollectContext): Promise<Collected> {
  const detail = await read<ProcessDetail>('process.detail', ctx.ref);
  if (detail.commandLine === null && detail.errors['commandLine']) throw new Error(detail.errors['commandLine']);
  return { text: [`Image: ${detail.imagePath ?? '(unavailable)'}`, `Current directory: ${detail.currentDirectory ?? '(unavailable)'}`, `Command line: ${detail.commandLine ?? '(unavailable)'}`, ''].join('\r\n') };
}

async function collectEnvironment(ctx: CollectContext): Promise<Collected> {
  const detail = await read<ProcessDetail>('process.detail', ctx.ref);
  if (detail.environment === null) throw new Error(detail.errors['environment'] ?? 'The environment could not be read (it may need an elevated DUDE).');
  return { json: detail.environment };
}

async function collectModules(ctx: CollectContext): Promise<Collected> {
  const { modules } = await read<ProcessModulesResult>('process.modules', ctx.ref);
  const paths = [...new Set(modules.map((m) => m.path).filter(Boolean))].slice(0, MAX_MODULE_INFO);
  const info = new Map<string, { version?: FileVersionResult; signature?: FileSignatureResult }>();
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < paths.length && !ctx.signal.aborted) {
      const path = paths[next++];
      const [version, signature] = await Promise.all([
        attempt(() => read<FileVersionResult>('file.version', { path })),
        attempt(() => read<FileSignatureResult>('file.signature', { path })),
      ]);
      info.set(path, { ...(version ? { version } : {}), ...(signature ? { signature } : {}) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(MODULE_INFO_CONCURRENCY, paths.length) }, worker));
  throwIfAborted(ctx.signal);
  return {
    json: {
      count: modules.length,
      versionInfoLimit: modules.length > paths.length ? MAX_MODULE_INFO : undefined,
      modules: modules.map((m) => {
        const extra = info.get(m.path);
        return {
          ...m,
          fileVersion: extra?.version?.fixed?.fileVersion ?? extra?.version?.strings['FileVersion'] ?? null,
          company: extra?.version?.strings['CompanyName'] ?? null,
          signature: extra?.signature ?? null,
        };
      }),
    },
  };
}

async function collectThreads(ctx: CollectContext): Promise<Collected> {
  return { json: await read<ProcessThreadsResult>('process.threads', { pid: ctx.ref.pid }) };
}

async function collectHandles(ctx: CollectContext): Promise<Collected> {
  if (!ctx.elevated) return { json: { note: HANDLES_NEED_ELEVATION, handles: [] }, status: 'skipped', note: HANDLES_NEED_ELEVATION };
  return { json: await read<ProcessHandlesResult>('process.handles', ctx.ref, 30_000) };
}

async function collectPorts(ctx: CollectContext): Promise<Collected> {
  const [tcp, udp] = await Promise.all([read<SocketTableResult>('net.tcp', {}), read<SocketTableResult>('net.udp', {})]);
  return { json: { entries: [...tcp.entries, ...udp.entries].filter((s) => s.pid === ctx.ref.pid) } };
}

function compactEvent(event: EventRecord): Omit<EventRecord, 'xml'> {
  const { xml: _xml, ...rest } = event;
  return rest;
}

async function collectEvents(ctx: CollectContext): Promise<Collected> {
  const window = `TimeCreated[timediff(@SystemTime) <= ${ctx.options.eventHours * 3_600_000}]`;
  const image = ctx.summary.name.toLowerCase();
  const byId = new Map<string, EventRecord>();
  const errors: string[] = [];
  let truncated = false;
  for (const channel of ['Application', 'System']) {
    throwIfAborted(ctx.signal);
    const queries = [
      { xpath: `*[System[Execution[@ProcessID=${ctx.ref.pid}] and ${window}]]`, limit: 200, filter: (_e: EventRecord) => true },
      {
        xpath: `*[System[(Level=1 or Level=2 or Level=3) and ${window}]]`, limit: 1000,
        filter: (e: EventRecord) => e.processId === ctx.ref.pid || (image.length >= 3 && `${e.message}\n${e.xml}`.toLowerCase().includes(image)),
      },
    ];
    for (const q of queries) {
      try {
        const result = await read<EventQueryResult>('evt.query', { channel, xpath: q.xpath, reverse: true, limit: q.limit }, 30_000);
        if (result.truncated) truncated = true;
        for (const event of result.events) if (q.filter(event)) byId.set(`${event.channel}:${event.recordId}`, event);
      } catch (error) { errors.push(`${channel}: ${message(error)}`); }
    }
  }
  if (errors.length >= 4) throw new Error(errors.join(' | '));
  const events = [...byId.values()].sort((a, b) => b.timeCreated.localeCompare(a.timeCreated));
  return {
    json: {
      lookbackHours: ctx.options.eventHours, matchedOn: ['Execution ProcessID', `image name "${ctx.summary.name}" in Level 1-3 events`],
      totalMatched: events.length, capped: events.length > MAX_EVENTS, sourceTruncated: truncated, errors,
      events: events.slice(0, MAX_EVENTS).map(compactEvent),
    },
  };
}

async function collectSamples(ctx: CollectContext): Promise<Collected> {
  const total = ctx.options.sampleSeconds;
  const samples: object[] = [];
  let previous: ProcessListResult | null = null;
  let note: string | undefined;
  for (let i = 0; i <= total; i++) {
    throwIfAborted(ctx.signal);
    const started = Date.now();
    const listing = await read<ProcessListResult>('process.list', {});
    const current = listing.processes.find((p) => p.pid === ctx.ref.pid && p.startKey === ctx.ref.startKey);
    if (!current) { note = `The process exited after ${i} sample(s).`; break; }
    const percent = previous ? cpuPercents(previous, listing).get(processKey(current)) : undefined;
    samples.push({
      sampledAtMs: listing.sampledAtMs, cpuPercent: percent === undefined ? null : Math.round(percent * 100) / 100,
      workingSetBytes: current.workingSetBytes, privateBytes: current.privateBytes, threads: current.threadCount, handles: current.handleCount,
    });
    previous = listing;
    ctx.onSample(i, total);
    if (i < total) await sleep(Math.max(0, 1000 - (Date.now() - started)), ctx.signal);
  }
  throwIfAborted(ctx.signal);
  return { json: { intervalMs: 1000, logicalProcessors: ctx.listing.logicalProcessors, cpuPercentOfWholeMachine: true, ...(note ? { note } : {}), samples }, ...(note ? { note } : {}) };
}

const COLLECTORS: Readonly<Record<Exclude<BundleSectionId, 'minidump'>, (ctx: CollectContext) => Promise<Collected>>> = {
  target: collectTarget, tree: collectTree, cmdline: collectCommandLine, env: collectEnvironment, modules: collectModules,
  threads: collectThreads, handles: collectHandles, ports: collectPorts, events: collectEvents, samples: collectSamples,
};

// ---- ZIP sink -----------------------------------------------------------------------------------

/** fflate's streaming `Zip` piped into a file stream, with backpressure. */
class ZipSink {
  private readonly zip = new Zip();
  private failure: Error | null = null;
  private readonly finished: Promise<void>;
  readonly stream: WriteStream;

  constructor(path: string) {
    this.stream = createWriteStream(path, { flags: 'w' });
    this.finished = new Promise((resolve, reject) => {
      this.stream.once('finish', resolve);
      this.stream.once('error', (error) => { this.failure = error; reject(error); });
    });
    this.finished.catch(() => { /* surfaced by finish()/drain() */ });
    this.zip.ondata = (error, chunk, final) => {
      if (error) { this.failure = error; return; }
      this.stream.write(chunk);
      if (final) this.stream.end();
    };
  }

  private check(): void { if (this.failure) throw this.failure; }

  private async drain(): Promise<void> {
    this.check();
    if (!this.stream.writableNeedDrain) return;
    await new Promise<void>((resolve, reject) => {
      const onDrain = (): void => { this.stream.off('error', onError); resolve(); };
      const onError = (error: Error): void => { this.stream.off('drain', onDrain); reject(error); };
      this.stream.once('drain', onDrain);
      this.stream.once('error', onError);
    });
  }

  async addBuffer(name: string, data: Uint8Array): Promise<number> {
    const entry = new ZipDeflate(name, { level: 6 });
    entry.mtime = Date.now();
    this.zip.add(entry);
    entry.push(data, true);
    await this.drain();
    return data.length;
  }

  /** Streams a file into the archive stored (uncompressed), 1 MiB at a time. */
  async addFile(name: string, path: string, signal: AbortSignal): Promise<number> {
    const entry = new ZipPassThrough(name);
    entry.mtime = Date.now();
    this.zip.add(entry);
    const handle = await fs.open(path, 'r');
    let total = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        const buffer = Buffer.allocUnsafe(READ_CHUNK);
        const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK, null);
        if (bytesRead === 0) break;
        total += bytesRead;
        entry.push(new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead), false);
        await this.drain();
      }
      entry.push(new Uint8Array(0), true);
      await this.drain();
    } finally { await handle.close(); }
    return total;
  }

  async finish(): Promise<void> {
    this.zip.end();
    this.check();
    await this.finished;
    this.check();
  }

  /** Stops the archive and waits for the file handle to close, so the partial file can be deleted (Windows locks it). */
  async abort(): Promise<void> {
    try { this.zip.terminate(); } catch { /* already ended */ }
    if (this.stream.closed) return;
    const closed = new Promise<void>((resolve) => this.stream.once('close', () => resolve()));
    this.stream.destroy();
    await closed;
  }
}

// ---- export -------------------------------------------------------------------------------------

function stagingDir(): string { return join(app.getPath('userData'), 'bundle-staging'); }

async function removeQuietly(path: string): Promise<void> {
  try { await fs.rm(path, { force: true }); } catch { /* best effort */ }
}

export interface BundleOwner { readonly id: number; send(channel: string, payload: BundleProgress): void; isDestroyed(): boolean }

export async function writeBundle(owner: BundleOwner, request: BundleWriteRequest, signal: AbortSignal): Promise<BundleWriteResult> {
  const enabledIds = BUNDLE_SECTION_IDS.filter((id) => request.sections[id]);
  const total = enabledIds.length + 1;
  let done = 0;
  const progress = (phase: BundleProgress['phase'], section?: BundleSectionId, at = done): void => {
    if (!owner.isDestroyed()) owner.send(PROGRESS_CHANNEL, { exportId: request.exportId, phase, ...(section ? { section } : {}), done: at, total });
  };

  const ref = { pid: request.pid, startKey: request.startKey };
  const [{ listing, summary }, elevated] = await Promise.all([locate(ref.pid, ref.startKey), isElevated()]);
  throwIfAborted(signal);

  const partial = `${request.savePath}.part`;
  const staging = join(stagingDir(), `${request.exportId}.dmp`);
  const sink = new ZipSink(partial);
  const sections: BundleManifestSection[] = [];
  const errors: { section: BundleSectionId; message: string }[] = [];
  const fileOf = (id: BundleSectionId): string => BUNDLE_SECTIONS.find((s) => s.id === id)!.file;
  const record = (entry: BundleManifestSection): void => {
    sections.push(entry);
    if (entry.error) errors.push({ section: entry.id, message: entry.error });
    progress('collecting', entry.id, ++done);
  };

  try {
    const ctx: CollectContext = {
      ref, summary, listing, elevated, options: request.options, signal,
      onSample: (at, count) => { if (!owner.isDestroyed()) owner.send(PROGRESS_CHANNEL, { exportId: request.exportId, phase: 'sampling', section: 'samples', done, total, sample: { done: at + 1, total: count + 1 } }); },
    };
    for (const id of enabledIds) {
      if (id === 'minidump') continue;
      throwIfAborted(signal);
      const file = fileOf(id);
      progress(id === 'samples' ? 'sampling' : 'collecting', id);
      try {
        const collected = await COLLECTORS[id](ctx);
        const data = strToU8(collected.text ?? JSON.stringify(collected.json, null, 2));
        const bytes = await sink.addBuffer(file, data);
        record({ id, file, status: collected.status ?? 'ok', bytes, ...(collected.note ? { note: collected.note } : {}) });
      } catch (error) {
        if (signal.aborted) throw error;
        record({ id, file, status: 'error', bytes: 0, error: message(error) });
      }
    }

    if (request.sections.minidump) {
      const file = fileOf('minidump');
      throwIfAborted(signal);
      progress('dumping', 'minidump');
      try {
        // Re-verify identity immediately before the dump; the helper verifies pid + startKey again itself.
        await locate(ref.pid, ref.startKey);
        await fs.mkdir(stagingDir(), { recursive: true });
        await read<{ bytes: number }>('proc.dump', { ...ref, outputPath: staging, full: request.options.fullDump }, DUMP_TIMEOUT_MS);
        throwIfAborted(signal);
        progress('writing', 'minidump');
        const bytes = await sink.addFile(file, staging, signal);
        record({ id: 'minidump', file, status: 'ok', bytes, note: request.options.fullDump ? 'Full-memory dump' : 'Minidump' });
      } catch (error) {
        if (signal.aborted) throw error;
        record({ id: 'minidump', file, status: 'error', bytes: 0, error: message(error) });
      } finally {
        await removeQuietly(staging);
      }
    }

    const manifest: BundleManifest = {
      schemaVersion: 1, tool: 'DUDE Process Diagnostic Bundle', dudeVersion: app.getVersion(), createdAt: new Date().toISOString(),
      target: { pid: ref.pid, startKey: ref.startKey, name: summary.name }, elevated, options: request.options, sections, errors,
    };
    await sink.addBuffer('manifest.json', strToU8(JSON.stringify(manifest, null, 2)));
    progress('writing', undefined, total - 1);
    throwIfAborted(signal);
    await sink.finish();
    await fs.rename(partial, request.savePath);
  } catch (error) {
    await sink.abort();
    await removeQuietly(partial);
    throw error;
  } finally {
    await removeQuietly(staging);
  }
  const bytes = (await fs.stat(request.savePath)).size;
  progress('done', undefined, total);
  return { path: request.savePath, bytes, sections };
}

// ---- IPC ----------------------------------------------------------------------------------------

const running = new Map<string, { readonly ownerId: number; readonly abort: AbortController }>();
const lastWritten = new Map<number, string>();

/** Only a real app window's top frame may call in. */
export function isTrustedSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): boolean {
  const sender: WebContents | undefined = event.sender;
  if (!sender || sender.isDestroyed()) return false;
  if (!BrowserWindow.fromWebContents(sender)) return false;
  return !event.senderFrame || event.senderFrame === sender.mainFrame;
}

function wrap<T>(action: () => Promise<T>): Promise<BundleResult<T>> {
  return action().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error: message(error), ...(message(error) === CANCELLED ? { cancelled: true } : {}) }),
  );
}

export function cancelAllBundles(): void {
  for (const entry of running.values()) entry.abort.abort();
}

export async function sweepBundleStaging(): Promise<void> {
  try { await fs.rm(stagingDir(), { recursive: true, force: true }); } catch { /* best effort */ }
}

export function registerSysBundleHandlers(): void {
  const stagingReady = sweepBundleStaging();
  ipcMain.handle('dude:sys-bundle:estimate', (event, request: unknown) => {
    if (!isTrustedSender(event)) return Promise.resolve({ ok: false as const, error: 'Request rejected.' });
    return wrap(() => estimateBundle(request));
  });
  ipcMain.handle('dude:sys-bundle:write', (event, raw: unknown) => {
    if (!isTrustedSender(event)) return Promise.resolve({ ok: false as const, error: 'Request rejected.' });
    return wrap(async () => {
      // Startup cleanup must finish before this export creates its staging file.
      await stagingReady;
      const request = validateWriteRequest(raw);
      if (running.has(request.exportId) || [...running.values()].some((entry) => entry.ownerId === event.sender.id)) throw new Error('Another bundle export is already running.');
      // Single-use: the grant is spent before any collection starts, so a second export needs a second dialog.
      if (!consumeSavePath(request.savePath)) throw new Error('Choose where to save the bundle first (the save dialog grants that one file).');
      const abort = new AbortController();
      running.set(request.exportId, { ownerId: event.sender.id, abort });
      const onDestroyed = (): void => abort.abort();
      event.sender.once('destroyed', onDestroyed);
      try {
        const result = await writeBundle(event.sender, request, abort.signal);
        lastWritten.set(event.sender.id, result.path);
        return result;
      } finally {
        running.delete(request.exportId);
        event.sender.removeListener('destroyed', onDestroyed);
      }
    });
  });
  ipcMain.handle('dude:sys-bundle:cancel', (event, exportId: unknown) => {
    if (!isTrustedSender(event) || typeof exportId !== 'string') return false;
    const entry = running.get(exportId);
    if (!entry || entry.ownerId !== event.sender.id) return false;
    entry.abort.abort();
    return true;
  });
  ipcMain.handle('dude:sys-bundle:reveal', (event, path: unknown) => {
    if (!isTrustedSender(event) || typeof path !== 'string' || lastWritten.get(event.sender.id) !== path) return false;
    shell.showItemInFolder(path);
    return true;
  });
}
