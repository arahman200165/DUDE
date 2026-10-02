import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { offerWorkspaceState } from "../../core/workspace/workspace-handoff.js";

const TOOL_ID = 'http-header-inspector';

/**
 * Deliberately never persists (pasted headers routinely carry Authorization/Cookie values — see
 * http-header-inspector.ts's own doc comment). No storage key exists to read, so `snapshot()`
 * returns undefined; `restore()` hands the value off in-memory only, mirroring
 * jwt.workspace-step.ts. `historyEligible` is deliberately omitted for the same reason.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    return undefined;
  },

  restore(state): void {
    if (typeof state['raw'] === 'string') {
      offerWorkspaceState(TOOL_ID, state);
    }
  },
};
