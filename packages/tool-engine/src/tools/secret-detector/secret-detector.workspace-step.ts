import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { offerWorkspaceState } from "../../core/workspace/workspace-handoff.js";

const TOOL_ID = 'secret-detector';

/**
 * `input` is deliberately `'none'`-policy (see secret-detector.ts) — the text being scanned may
 * itself contain real secrets. No storage key to read/write, so this mirrors the jwt.ts pattern:
 * restore() hands off in-memory only. `historyEligible` is deliberately omitted — a secret scanner's
 * input is exactly the payload History must never record.
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
