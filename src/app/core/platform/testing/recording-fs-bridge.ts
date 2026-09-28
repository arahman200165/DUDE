import type { ApplyResult, FsJobEvent, FsJobRequest, PlanPreview } from '../../../../shared-logic/fs/fs-types';
import type { DudeElectronBridge } from '../electron-bridge';
import { fakeElectronBridge } from './fake-electron-bridge';

/** A minimal, valid plan preview for specs. */
export function fakePlanPreview(overrides: Partial<PlanPreview> = {}): PlanPreview {
  return {
    planId: 'plan-1',
    title: 'Spec plan',
    tool: 'spec',
    root: 'C:\\work',
    ops: [{ index: 0, kind: 'write', path: 'a.txt', size: 3, newSize: 4 }],
    skipped: [],
    counts: { rename: 0, write: 1, create: 0, trash: 0 },
    backupBytes: 3,
    exceedsBackupCap: false,
    expiresAt: '2030-01-01T00:15:00.000Z',
    ...overrides,
  };
}

export interface RecordedFsCalls {
  readonly jobs: FsJobRequest[];
  readonly plansBuilt: string[];
  readonly tokens: string[];
  readonly applies: string[];
}

/**
 * A desktop bridge that records every fs job and mutation call, for Phase 29 confirmation-boundary
 * specs (DUDE_PRD.md §5.2.1 item 4): a tool's spec drives its UI and asserts that `apply` only ever
 * happens after the preview's review *and* confirm steps. Jobs resolve with `jobResult(request)`;
 * a result containing `preview` stands in for a main-process-registered plan.
 */
export function recordingFsBridge(options: {
  jobResult?: (request: FsJobRequest) => unknown;
  jobItems?: (request: FsJobRequest) => readonly unknown[];
  preview?: PlanPreview;
} = {}): { bridge: DudeElectronBridge; calls: RecordedFsCalls } {
  const calls: RecordedFsCalls = { jobs: [], plansBuilt: [], tokens: [], applies: [] };
  let listener: ((event: FsJobEvent) => void) | null = null;
  let next = 0;
  const preview = options.preview ?? fakePlanPreview();
  const applyResult: ApplyResult = {
    planId: preview.planId, applied: 1, conflicts: 0, failed: 0, cancelled: 0,
    journal: { planId: preview.planId, title: preview.title, tool: preview.tool, root: preview.root, appliedAt: '2030-01-01T00:00:00.000Z', ops: [], backupBytes: 0, backupsPruned: false, noUndo: false },
  };
  const base = fakeElectronBridge();
  const bridge = fakeElectronBridge({
    fs: { ...base.fs, isGranted: async () => true, pickDirectory: async () => ({ canceled: false, rootPath: 'C:\\work', rootName: 'work' }) },
    fsJobs: {
      start: async (request) => {
        calls.jobs.push(request);
        const jobId = `job-${++next}`;
        setTimeout(() => {
          const items = options.jobItems?.(request) ?? [];
          if (items.length) listener?.({ jobId, type: 'batch', items });
          const data = options.jobResult?.(request) ?? {};
          if (data && typeof data === 'object' && 'preview' in data) calls.plansBuilt.push(request.kind);
          listener?.({ jobId, type: 'result', data });
          listener?.({ jobId, type: 'done' });
        });
        return { ok: true, jobId };
      },
      cancel: async () => true,
      onEvent: (callback) => { listener = callback; return () => { listener = null; }; },
    },
    fsMutation: {
      ...base.fsMutation,
      planTrash: async () => { calls.plansBuilt.push('trash'); return { ok: true, value: preview }; },
      planWriteText: async () => { calls.plansBuilt.push('write-text'); return { ok: true, value: preview }; },
      planUndo: async () => { calls.plansBuilt.push('undo'); return { ok: true, value: preview }; },
      issueToken: async (planId) => { calls.tokens.push(planId); return { ok: true, token: `token-${planId}`, expiresAt: '2030-01-01T00:01:00.000Z' }; },
      apply: async (planId) => { calls.applies.push(planId); return { ok: true, value: applyResult }; },
    },
  });
  return { bridge, calls };
}

/** Flushes the fake job's `setTimeout` delivery and Angular's change detection. */
export async function settleFsJobs(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  for (let round = 0; round < 4; round++) {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

/** Installs a bridge as `window.dude` (other specs define it non-writable, so plain assignment can silently fail). */
export function installBridge(bridge: unknown): void {
  Object.defineProperty(window, 'dude', { value: bridge, configurable: true, writable: true });
}

export function removeBridge(): void {
  Object.defineProperty(window, 'dude', { value: undefined, configurable: true, writable: true });
}
