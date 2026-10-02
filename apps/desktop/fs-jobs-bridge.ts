import { app, ipcMain, utilityProcess, type UtilityProcess, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { FsJobEvent, FsJobRequest, FsResult, MutationPlanDraft, PlanPreview } from "@dude/contracts/fs/fs-types";
import { isRootGranted, normalizeRoot } from './fs-grants';

/**
 * Main-process side of the fs utility process (Phase 29, Milestone 523): the `dude:fsjob:*` IPC a
 * renderer uses to start/cancel streamed filesystem jobs. Every root — the job's own and any param
 * named `…Root` (e.g. a split's output folder) — must already be granted; the worker is started
 * lazily, restarted if it dies, and a window's jobs are cancelled when it goes away.
 */

interface Job { readonly owner: WebContents; readonly kind: string; queue: Promise<void> }
const jobs = new Map<string, Job>();
const MAX_JOBS_PER_WINDOW = 4;
let worker: UtilityProcess | null = null;

type PlanInterceptor = (owner: WebContents, draft: MutationPlanDraft) => Promise<PlanPreview>;
let interceptPlan: PlanInterceptor | null = null;
/** The mutation engine (`fs-mutation.ts`) registers here so plan drafts never reach the renderer as raw ops. */
export function setPlanInterceptor(interceptor: PlanInterceptor): void { interceptPlan = interceptor; }

export function attributeHelperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'fs-attrs.exe') : join(__dirname, '../../build/fs-attrs.exe');
}

function send(owner: WebContents, event: FsJobEvent): void {
  if (!owner.isDestroyed()) owner.send('dude:fsjob:event', event);
}

/** Events are routed through a per-job queue so an async plan interception can't reorder `result`/`done`. */
function route(event: FsJobEvent): void {
  const job = jobs.get(event.jobId);
  if (!job) return;
  job.queue = job.queue.then(() => deliver(job, event));
}

async function deliver(job: Job, event: FsJobEvent): Promise<void> {
  if (event.type === 'result' && event.data && typeof event.data === 'object' && 'plan' in event.data) {
    const { plan, ...rest } = event.data as { plan: MutationPlanDraft };
    try {
      if (!interceptPlan) throw new Error('The mutation engine is not available.');
      const preview = await interceptPlan(job.owner, plan);
      send(job.owner, { jobId: event.jobId, type: 'result', data: { ...rest, preview } });
    } catch (error) {
      send(job.owner, { jobId: event.jobId, type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  send(job.owner, event);
  if (event.type === 'done') jobs.delete(event.jobId);
}

function ensureWorker(): UtilityProcess {
  if (worker) return worker;
  const child = utilityProcess.fork(join(__dirname, 'fs-worker.js'), [`--user-data=${app.getPath('userData')}`, `--attr-helper=${attributeHelperPath()}`], { serviceName: 'DUDE filesystem worker' });
  child.on('message', (event: FsJobEvent) => route(event));
  child.once('exit', () => {
    worker = null;
    for (const [jobId, job] of jobs) {
      send(job.owner, { jobId, type: 'error', message: 'The filesystem worker stopped unexpectedly.' });
      send(job.owner, { jobId, type: 'done' });
    }
    jobs.clear();
  });
  worker = child;
  return child;
}

/** Validates renderer input and normalizes every granted root it names. Exported for specs. */
export function validateJobRequest(raw: unknown): FsJobRequest {
  const request = (raw && typeof raw === 'object' ? raw : {}) as Partial<FsJobRequest>;
  if (typeof request.kind !== 'string' || !/^[a-z][a-z0-9-]{1,48}$/.test(request.kind)) throw new Error('Unknown filesystem job.');
  if (!isRootGranted(request.root)) throw new Error('Pick this folder or file with the native picker first.');
  const params = request.params && typeof request.params === 'object' && !Array.isArray(request.params) ? { ...(request.params as Record<string, unknown>) } : {};
  for (const [key, value] of Object.entries(params)) {
    if (!key.endsWith('Root')) continue;
    if (!isRootGranted(value)) throw new Error('Pick the output folder with the native picker first.');
    params[key] = normalizeRoot(value);
  }
  return { kind: request.kind, root: normalizeRoot(request.root), params };
}

export function registerFsJobHandlers(): void {
  ipcMain.handle('dude:fsjob:start', (event, raw: unknown): FsResult<{ jobId: string }> => {
    try {
      const request = validateJobRequest(raw);
      const owner = event.sender;
      if ([...jobs.values()].filter((job) => job.owner.id === owner.id).length >= MAX_JOBS_PER_WINDOW) throw new Error('At most four filesystem jobs may run at once.');
      const jobId = randomUUID();
      jobs.set(jobId, { owner, kind: request.kind, queue: Promise.resolve() });
      owner.once('destroyed', () => cancelJob(jobId));
      ensureWorker().postMessage({ type: 'start', jobId, kind: request.kind, root: request.root, params: request.params });
      return { ok: true, jobId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('dude:fsjob:cancel', (event, jobId: unknown): boolean => {
    if (typeof jobId !== 'string') return false;
    const job = jobs.get(jobId);
    if (!job || job.owner.id !== event.sender.id) return false;
    cancelJob(jobId);
    return true;
  });
}

function cancelJob(jobId: string): void {
  if (jobs.has(jobId)) worker?.postMessage({ type: 'cancel', jobId });
}

export function stopFsWorker(): void {
  for (const jobId of jobs.keys()) cancelJob(jobId);
  worker?.kill();
  worker = null;
}
