import { join } from 'node:path';
import type { FsJobEvent, FsJobProgress, WalkIssue } from '../src/shared-logic/fs/fs-types';
import { attributeReader, type AttributeReader } from './fs-walk';

/**
 * The fs utility process's job registry (Phase 29, Milestone 523) — the filesystem sibling of
 * `network-live.ts`. Each Phase 29 tool registers its heavy work as a *kind* in its own
 * `fs-job-*.ts` module (imported from `fs-job-kinds.ts`), so the runner never grows a per-tool
 * branch. Handlers stream items and progress through the context and return their final result;
 * a result carrying a `plan` is intercepted by the main process's mutation engine (`fs-mutation.ts`)
 * and never reaches the renderer as raw ops.
 */

export interface FsJobContext {
  /** Normalized absolute root (or single file) the main process already checked is granted. */
  readonly root: string;
  readonly params: unknown;
  readonly signal: AbortSignal;
  /** Plan builders stage new file content here; the main process validates and applies it. */
  readonly stagingDir: string;
  /** DUDE's app-data folder (snapshot library, watch timelines) — never the user's folder. */
  readonly userData: string;
  readonly attributes: AttributeReader | null;
  progress(progress: FsJobProgress): void;
  batch(item: unknown): void;
  issue(issue: WalkIssue): void;
}

export type FsJobHandler = (context: FsJobContext) => Promise<unknown>;

const handlers = new Map<string, FsJobHandler>();

export function registerFsJob(kind: string, handler: FsJobHandler): void {
  handlers.set(kind, handler);
}

export function hasFsJob(kind: string): boolean { return handlers.has(kind); }

export interface FsRuntime {
  readonly userData: string;
  readonly attributeHelper: string;
}

const BATCH_SIZE = 500;
const FLUSH_MS = 150;
const PROGRESS_MS = 200;

/**
 * Runs one job, emitting events through `emit` (the utility process posts them to the main
 * process; specs collect them in an array). Batches and progress are throttled so a drive-wide walk
 * doesn't flood IPC with one message per file.
 */
export async function runFsJob(
  jobId: string,
  kind: string,
  root: string,
  params: unknown,
  signal: AbortSignal,
  runtime: FsRuntime,
  emit: (event: FsJobEvent) => void,
): Promise<void> {
  const handler = handlers.get(kind);
  let items: unknown[] = [];
  let issues: WalkIssue[] = [];
  let lastFlush = Date.now();
  let lastProgress = 0;
  const flush = () => {
    if (items.length) { emit({ jobId, type: 'batch', items }); items = []; }
    if (issues.length) { emit({ jobId, type: 'issues', issues }); issues = []; }
    lastFlush = Date.now();
  };
  const context: FsJobContext = {
    root,
    params,
    signal,
    stagingDir: join(runtime.userData, 'fs-staging'),
    userData: runtime.userData,
    attributes: attributeReader(runtime.attributeHelper),
    progress(progress) {
      const now = Date.now();
      if (now - lastProgress < PROGRESS_MS) return;
      lastProgress = now;
      emit({ jobId, type: 'progress', progress });
    },
    batch(item) {
      items.push(item);
      if (items.length >= BATCH_SIZE || Date.now() - lastFlush > FLUSH_MS) flush();
    },
    issue(issue) {
      issues.push(issue);
      if (issues.length >= BATCH_SIZE) flush();
    },
  };
  try {
    if (!handler) throw new Error(`Unknown filesystem job "${kind}".`);
    const data = await handler(context);
    flush();
    emit({ jobId, type: 'result', data });
  } catch (error) {
    flush();
    emit({ jobId, type: 'error', message: signal.aborted ? 'Cancelled.' : error instanceof Error ? error.message : String(error) });
  } finally {
    emit({ jobId, type: 'done' });
  }
}
