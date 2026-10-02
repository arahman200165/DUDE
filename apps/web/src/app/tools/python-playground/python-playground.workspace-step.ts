import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'python-playground';

/**
 * `code` is `user-choice` policy (see python-playground.ts) — the storage bridge already resolves
 * that the same way `PersistenceService` does (session until the user opts in via
 * `PersistenceOptIn`, then local), so snapshot()/restore() need no special-casing here.
 *
 * `historyEligible` is deliberately omitted: this is a sandboxed execution tool, and a History
 * entry restoring source code must never also re-trigger a run — that policy question belongs to
 * the mechanical retrofit pass that opts sandboxed tools in deliberately (see
 * core/history/AGENTS.md), not this proof-of-concept adapter.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const code = readStorageValue<string>(TOOL_ID, 'code', 'user-choice');
    if (!code) return undefined;

    const preview = code.length > 40 ? `${code.slice(0, 40)}…` : code;
    return { state: { code }, summary: `Python: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['code'] === 'string') {
      writeStorageValue(TOOL_ID, 'code', 'user-choice', state['code']);
    }
  },
};
