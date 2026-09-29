import type { SysApplyResult, SysJournalEntry, SysPlanPreview, SysPlanRequest } from '../../../../shared-logic/system/sys-mutation-types';
import type { DudeElectronBridge } from '../electron-bridge';
import { fakeElectronBridge } from './fake-electron-bridge';

/** A minimal, valid system plan preview for specs. */
export function fakeSysPlanPreview(overrides: Partial<SysPlanPreview> = {}): SysPlanPreview {
  return {
    planId: 'sys-plan-1',
    title: 'Spec system change',
    tool: 'spec',
    ops: [{
      index: 0, kind: 'env.set', target: 'HKCU\\Environment\\FOO', summary: 'Set user environment variable',
      before: '(unset)', after: 'bar', warnings: [], requiresElevation: false, noUndo: false,
    }],
    blocked: [],
    typedConfirm: [],
    noUndo: false,
    elevated: false,
    expiresAt: '2030-01-01T00:15:00.000Z',
    ...overrides,
  };
}

export function fakeSysApplyResult(preview: SysPlanPreview, overrides: Partial<SysApplyResult> = {}): SysApplyResult {
  return {
    planId: preview.planId, applied: preview.ops.length, conflicts: 0, failed: 0, cancelled: 0,
    journal: {
      planId: preview.planId, title: preview.title, tool: preview.tool, appliedAt: '2030-01-01T00:00:00.000Z',
      elevated: preview.elevated, ops: [], backupBytes: 0, backupsPruned: false,
    },
    ...overrides,
  };
}

export interface RecordedSysCalls {
  readonly plans: SysPlanRequest[];
  readonly undoPlans: string[];
  /** The plan id and typed names passed to each `issueToken`. */
  readonly tokens: { planId: string; typed: readonly string[] }[];
  /** The plan id, token, and no-undo acknowledgement passed to each `apply`. */
  readonly applies: { planId: string; token: string; acceptNoUndo: boolean }[];
  readonly cancels: string[];
  readonly discards: string[];
}

export interface RecordingSysOptions {
  readonly preview?: SysPlanPreview;
  readonly journalEntries?: readonly SysJournalEntry[];
  /** Makes `issueToken` fail, as a stale or rejected token would. */
  readonly tokenError?: string;
  readonly applyResult?: SysApplyResult;
}

/**
 * A desktop bridge that records every system mutation call, for Phase 31 confirmation-boundary specs
 * (DUDE_PRD.md §5.2.1 item 4): a spec drives the UI and asserts `apply` only happens after the
 * preview's review *and* confirm steps. `plan` and `planUndo` resolve with `preview`.
 */
export function recordingSysBridge(options: RecordingSysOptions = {}): { bridge: DudeElectronBridge; calls: RecordedSysCalls; preview: SysPlanPreview } {
  const preview = options.preview ?? fakeSysPlanPreview();
  const applyResult = options.applyResult ?? fakeSysApplyResult(preview);
  const calls: RecordedSysCalls = { plans: [], undoPlans: [], tokens: [], applies: [], cancels: [], discards: [] };
  const bridge = fakeSysBridge({
    plan: async (request) => { calls.plans.push(request); return { ok: true, value: preview }; },
    planUndo: async (planId) => { calls.undoPlans.push(planId); return { ok: true, value: preview }; },
    issueToken: async (planId, typed) => {
      calls.tokens.push({ planId, typed });
      return options.tokenError ? { ok: false, error: options.tokenError } : { ok: true, value: { token: `token-${planId}`, expiresAt: '2030-01-01T00:01:00.000Z' } };
    },
    apply: async (planId, token, applyOptions) => {
      calls.applies.push({ planId, token, acceptNoUndo: !!applyOptions?.acceptNoUndo });
      return { ok: true, value: applyResult };
    },
    cancelApply: async (planId) => { calls.cancels.push(planId); return true; },
    discard: async (planId) => { calls.discards.push(planId); return true; },
    journal: async () => ({ ok: true, value: options.journalEntries ?? [] }),
  });
  return { bridge, calls, preview };
}

/** A fake bridge with the given `sysMutation` members overridden (everything else keeps the fake defaults). */
export function fakeSysBridge(sysMutation: Partial<DudeElectronBridge['sysMutation']> = {}): DudeElectronBridge {
  const base = fakeElectronBridge();
  return fakeElectronBridge({ sysMutation: { ...base.sysMutation, ...sysMutation } });
}
