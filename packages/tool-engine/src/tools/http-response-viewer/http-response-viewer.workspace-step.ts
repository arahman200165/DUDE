import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { offerWorkspaceState } from "../../core/workspace/workspace-handoff.js";

const TOOL_ID = 'http-response-viewer';

/**
 * Deliberately never persists (a pasted response can carry Set-Cookie/other sensitive response
 * headers — see http-response-viewer.ts's own doc comment). No storage key exists to read, so
 * `snapshot()` returns undefined; `restore()` hands the value off in-memory only, mirroring
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
