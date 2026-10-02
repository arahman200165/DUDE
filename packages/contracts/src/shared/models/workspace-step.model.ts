/**
 * The contract every workspace/history-eligible tool exposes via `<id>.workspace-step.ts`
 * (resolved by `loadWorkspaceStep`, never registered by hand — see `core/workspace/AGENTS.md`).
 * One adapter file per tool, shared by two features (DUDE_PRD.md §21 Phase 21 Items 4-5):
 * the Persistent Workspace's tab/panel state mirroring, and Persistent Local History's recording.
 */
export interface WorkspaceSnapshot {
  /** Small, JSON-serializable state sufficient to restore the tool's on-screen state. */
  readonly state: Readonly<Record<string, unknown>>;
  /** One-line human-readable label — used for the tab tooltip and as History's default list label. */
  readonly summary: string;
}

export interface WorkspaceStep {
  /** Reads the tool's current state into one snapshot. `undefined` means nothing worth saving right now. */
  snapshot(): WorkspaceSnapshot | undefined;
  /** Applies `state` back to the tool, called before the tool component (re)mounts. */
  restore(state: Readonly<Record<string, unknown>>): void;
  /**
   * Opt-in only — absent or `false` means Local History never records this tool, even though it
   * may still be Workspace-eligible for live tab/panel mirroring. Default is deliberately
   * ineligible: see `core/history/AGENTS.md` for why this can't be inferred from the tool's own
   * `PersistencePolicy`.
   */
  readonly historyEligible?: boolean;
  /** Optional override of `summary` for the History list, e.g. richer than a tab tooltip needs. */
  historySummary?(state: Readonly<Record<string, unknown>>): string;
}
