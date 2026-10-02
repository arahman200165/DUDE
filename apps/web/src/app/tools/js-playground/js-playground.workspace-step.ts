import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'js-playground';

/**
 * Sandboxed execution tool (mirrors python-playground.workspace-step.ts): eligible for source
 * text only, never execution output. `historyEligible` is omitted, matching the precedent set for
 * python-playground — `restore()` only ever repopulates the editor, never triggers a run.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const code = readStorageValue<string>(TOOL_ID, 'code', 'session');
    if (!code) return undefined;
    const preview = code.length > 40 ? `${code.slice(0, 40)}…` : code;
    return { state: { code }, summary: `JS: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['code'] === 'string') writeStorageValue(TOOL_ID, 'code', 'session', state['code']);
  },
};
