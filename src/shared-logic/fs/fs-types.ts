/**
 * Shared shapes for Phase 29's native filesystem layer (DUDE_PRD.md §21 Phase 29): the tree walker's
 * options/entries, the utility-process job protocol, and the mutation engine's plans and journal.
 * Type-only, so the renderer, the Electron main process, and the fs utility process all agree on one
 * contract without either side runtime-importing the other.
 */

// ---- Walk ----

export interface WalkOptions {
  /** Honor nested `.gitignore` files plus `.git/info/exclude`. */
  readonly useGitignore: boolean;
  /** Skip the (editable) default-exclude preset below. */
  readonly useDefaultExcludes: boolean;
  /** Replaces `DEFAULT_EXCLUDES` when present. Name globs, or path globs when they contain `/`. */
  readonly defaultExcludes?: readonly string[];
  /** File path globs; an empty list includes every file. Directories are never filtered by these. */
  readonly include: readonly string[];
  /** Path globs that prune files and whole directories. */
  readonly exclude: readonly string[];
  /** Skip Windows hidden/system-attributed entries (read through the attribute helper). */
  readonly skipHidden: boolean;
  /** Skip dot-prefixed names. */
  readonly skipDotfiles: boolean;
  /** Traverse symlinks/junctions whose target stays inside the granted root (cycle-safe). */
  readonly followLinks: boolean;
  /** 0 lists only the root's direct children; null is unlimited. */
  readonly maxDepth: number | null;
  readonly minSize?: number | null;
  readonly maxSize?: number | null;
  readonly modifiedAfter?: number | null;
  readonly modifiedBefore?: number | null;
}

export type WalkEntryKind = 'file' | 'dir' | 'link';

export interface WalkEntry {
  /** Posix path relative to the walk root. */
  readonly path: string;
  readonly kind: WalkEntryKind;
  readonly size: number;
  readonly mtimeMs: number;
  /** 0 for the root's direct children. */
  readonly depth: number;
  readonly linkTarget?: string;
  /** True when this is a link that was traversed (followLinks) rather than just reported. */
  readonly followed?: boolean;
}

export interface WalkIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface WalkStats {
  readonly files: number;
  readonly dirs: number;
  readonly links: number;
  readonly bytes: number;
  readonly skipped: number;
  readonly issues: number;
}

// ---- Jobs (renderer ⇄ main ⇄ fs utility process) ----

export interface FsJobRequest {
  readonly kind: string;
  /** A root (or single file) the user granted through the native picker. */
  readonly root: string;
  readonly params?: unknown;
}

export interface FsJobProgress {
  readonly phase?: string;
  readonly scanned: number;
  readonly bytes: number;
  readonly total?: number;
  readonly current?: string;
}

export type FsJobEvent =
  | { readonly jobId: string; readonly type: 'progress'; readonly progress: FsJobProgress }
  | { readonly jobId: string; readonly type: 'batch'; readonly items: readonly unknown[] }
  | { readonly jobId: string; readonly type: 'issues'; readonly issues: readonly WalkIssue[] }
  | { readonly jobId: string; readonly type: 'result'; readonly data: unknown }
  | { readonly jobId: string; readonly type: 'error'; readonly message: string }
  | { readonly jobId: string; readonly type: 'done' };

export type FsResult<T = object> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };

export interface RememberedFolder {
  readonly path: string;
  readonly name: string;
  readonly addedAt: string;
  /** False when the folder no longer exists (it is then not re-granted on launch). */
  readonly available: boolean;
}

export interface PickedFile {
  readonly path: string;
  readonly name: string;
  readonly size: number;
}

// ---- Mutation engine (DUDE_PRD.md §5.2.1) ----

export interface Precondition {
  readonly size: number;
  readonly mtimeMs: number;
}

export type MutationOpKind = 'rename' | 'write' | 'create' | 'trash';

/** Absolute paths; built only in the main/utility process, never accepted from the renderer. */
export type MutationOp =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string; readonly expect: Precondition; readonly detail?: string }
  | { readonly kind: 'write'; readonly path: string; readonly staged: string; readonly expect: Precondition; readonly newSize: number; readonly detail?: string; readonly sample?: DiffSample }
  | { readonly kind: 'create'; readonly path: string; readonly staged: string; readonly newSize: number; readonly detail?: string }
  | { readonly kind: 'trash'; readonly path: string; readonly expect: Precondition; readonly detail?: string };

export interface DiffSample {
  readonly before: string;
  readonly after: string;
}

/** What a plan-building job returns (the `plan` field is intercepted by the main process). */
export interface MutationPlanDraft {
  readonly title: string;
  readonly tool: string;
  readonly root: string;
  readonly ops: readonly MutationOp[];
  /** Ops the builder deliberately left out (lossy conversion, collision, invalid name…). */
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
}

export interface PreviewOp {
  readonly index: number;
  readonly kind: MutationOpKind;
  /** Root-relative posix path (or absolute when outside the root, e.g. a split's output folder). */
  readonly path: string;
  readonly to?: string;
  readonly size: number;
  readonly newSize?: number;
  readonly detail?: string;
  readonly sample?: DiffSample;
}

export interface PlanPreview {
  readonly planId: string;
  readonly title: string;
  readonly tool: string;
  readonly root: string;
  readonly ops: readonly PreviewOp[];
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  readonly counts: Readonly<Record<MutationOpKind, number>>;
  /** Bytes of originals that would be backed up for undo. */
  readonly backupBytes: number;
  /** True when backups would push the store past its cap (apply then needs `acceptNoUndo`). */
  readonly exceedsBackupCap: boolean;
  readonly expiresAt: string;
  readonly undoOf?: string;
}

export type OpOutcome = 'applied' | 'conflict' | 'failed' | 'cancelled' | 'pending';

export interface JournalOp {
  readonly kind: MutationOpKind;
  readonly path: string;
  readonly to?: string;
  readonly outcome: OpOutcome;
  readonly message?: string;
  /** Backup file name inside the plan's backup folder (write ops). */
  readonly backup?: string;
  /** Size/mtime of the result, so undo can tell whether it was touched since. */
  readonly after?: Precondition;
  readonly expect?: Precondition;
}

export interface JournalEntry {
  readonly planId: string;
  readonly title: string;
  readonly tool: string;
  readonly root: string;
  readonly appliedAt: string;
  readonly ops: readonly JournalOp[];
  readonly backupBytes: number;
  readonly backupsPruned: boolean;
  readonly noUndo: boolean;
  readonly undoOf?: string;
  readonly undoneBy?: string;
}

export interface MutationSettings {
  readonly retentionDays: number;
  readonly maxBackupBytes: number;
}

export interface ApplyResult {
  readonly planId: string;
  readonly applied: number;
  readonly conflicts: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly journal: JournalEntry;
}

// ---- Duplicate Files (Milestone 528) ----

export interface DuplicateFile { readonly path: string; readonly size: number; readonly mtimeMs: number }
export interface DuplicateGroup {
  readonly key: string;
  readonly size: number;
  readonly files: readonly DuplicateFile[];
  /** Bytes reclaimed by keeping one copy. */
  readonly wasted: number;
  /** False in content mode when the copies differ only by normalization (EOL, whitespace, BOM). */
  readonly identicalBytes: boolean;
}
