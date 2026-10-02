import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { offerWorkspaceState } from "../../core/workspace/workspace-handoff.js";

const TOOL_ID = 'kubeconfig-inspector';

/**
 * `input` is `'none'`-policy in the tool's own code (a kubeconfig routinely embeds client
 * certs/keys/tokens) — no storage key exists to read, so `snapshot()` returns undefined;
 * `restore()` hands the value off in-memory only, mirroring jwt.workspace-step.ts.
 * `historyEligible` is deliberately omitted for the same reason.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    return undefined;
  },

  restore(state): void {
    if (typeof state['input'] === 'string') {
      offerWorkspaceState(TOOL_ID, state);
    }
  },
};
