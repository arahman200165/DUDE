/**
 * Shared contract for DUDE's Windows system mutation engine (DUDE_PRD.md §5.2.1, §21 Phase 31,
 * Milestone 594) — the second local implementation of the Destructive-Action Contract, after the
 * Phase 29 filesystem engine.
 *
 * The renderer never sends raw helper calls. It asks for a *plan* made of op requests (`kind` +
 * params); main validates each one with its registered op definition, reads the current state
 * (the precondition, kept main-side), and returns a preview. Applying needs a single-use token
 * bound to the window and plan digest (60 s), and — for critical targets — the exact typed names.
 */

/** One requested change. `kind` is a registered op kind such as `process.kill` or `registry.setValue`. */
export interface SysOpRequest {
  readonly kind: string;
  readonly params: unknown;
}

export interface SysPlanRequest {
  /** The requesting tool id (journal attribution only). */
  readonly tool: string;
  readonly title: string;
  readonly ops: readonly SysOpRequest[];
}

export interface SysPreviewOp {
  readonly index: number;
  readonly kind: string;
  /** Exact target as the user should recognise it, e.g. `notepad.exe (PID 1234)` or `HKCU\Environment\PATH`. */
  readonly target: string;
  /** What will happen, e.g. `Terminate the process` or `Set REG_EXPAND_SZ value`. */
  readonly summary: string;
  readonly before?: string;
  readonly after?: string;
  readonly warnings: readonly string[];
  /** The op needs an elevated session; in a non-elevated session the plan is blocked. */
  readonly requiresElevation: boolean;
  /** The user must type this name exactly (case-insensitive) before a token is issued. */
  readonly typedConfirm?: string;
  /** The op cannot be undone (kill, restart, uninstall, script run, minidump). */
  readonly noUndo: boolean;
}

export interface SysPlanPreview {
  readonly planId: string;
  readonly title: string;
  readonly tool: string;
  readonly ops: readonly SysPreviewOp[];
  /** Ops that cannot be applied as requested (e.g. need elevation); a plan with any is not applicable. */
  readonly blocked: readonly { readonly index: number; readonly reason: string }[];
  /** Distinct names the user must type to confirm (from `typedConfirm`). */
  readonly typedConfirm: readonly string[];
  /** True when any op is `noUndo`; applying then needs `acceptNoUndo`. */
  readonly noUndo: boolean;
  readonly elevated: boolean;
  readonly expiresAt: string;
  readonly undoOf?: string;
}

export type SysOpOutcome = 'applied' | 'conflict' | 'failed' | 'cancelled';

export interface SysJournalOp {
  readonly kind: string;
  readonly target: string;
  readonly summary: string;
  readonly outcome: SysOpOutcome;
  readonly message?: string;
  readonly before?: string;
  readonly after?: string;
  /** The inverse request recorded at apply time; undo builds a fresh plan from these. */
  readonly undo?: SysOpRequest;
  readonly noUndo: boolean;
}

export interface SysJournalEntry {
  readonly planId: string;
  readonly title: string;
  readonly tool: string;
  readonly appliedAt: string;
  readonly elevated: boolean;
  readonly ops: readonly SysJournalOp[];
  readonly backupBytes: number;
  readonly backupsPruned: boolean;
  readonly undoOf?: string;
  readonly undoneBy?: string;
}

export interface SysApplyResult {
  readonly planId: string;
  readonly applied: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly journal: SysJournalEntry;
}

export interface SysMutationSettings {
  readonly retentionDays: number;
  readonly maxBackupBytes: number;
}

export const DEFAULT_SYS_MUTATION_SETTINGS: SysMutationSettings = { retentionDays: 30, maxBackupBytes: 500 * 1024 ** 2 };

export type SysMutResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

// ---- Snapshot library (userData/system-snapshots/<kind>/<id>.json) ------------------------------

export const SYS_SNAPSHOT_KINDS = ['env', 'path', 'registry', 'process-env'] as const;
export type SysSnapshotKind = (typeof SYS_SNAPSHOT_KINDS)[number];

export interface SysSnapshotHeader {
  readonly id: string;
  readonly kind: SysSnapshotKind;
  readonly name: string;
  /** Where it was captured from, e.g. `HKCU\Environment` or `node.exe (PID 1234)`. */
  readonly source: string;
  readonly createdAt: string;
  readonly bytes: number;
}

export interface SysSnapshot extends SysSnapshotHeader {
  /** Tool-defined JSON payload (a name→value map for env kinds, a key tree for registry). */
  readonly data: unknown;
}
