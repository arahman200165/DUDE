import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { offerWorkspaceState } from "../../core/workspace/workspace-handoff.js";

const TOOL_ID = 'jwt';

/**
 * JWT Debugger deliberately never persists its input (see jwt.ts's own doc comment,
 * DUDE_PRD.md §14.1/§30 — JWTs are the canonical "no automatic persistence" example), so there is
 * no storage key for `workspace-storage-bridge.ts` to read or write. `snapshot()` reads the token
 * straight out of the live in-memory value the tool's component last held (kept only in Workspace's
 * own in-memory tier — see `WorkspaceStateService` — since jwt's policy forbids anything durable).
 * `restore()` can't write to storage either, so it hands the value off via `workspace-handoff.ts`,
 * the same one-shot in-memory pattern jwt.ts already uses for Smart Paste prefill; the tool's own
 * constructor consumes it.
 *
 * `historyEligible` is deliberately omitted (defaults to `false`) — a JWT's decoded contents are
 * exactly the sensitive payload History must never record.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    // Nothing to read here: a 'none'-policy tool's live value lives only in the component
    // instance's own signal, not in any storage this module can see. Tab-switch mirroring for
    // this tool therefore relies on Workspace's in-memory-only capture of that live value at the
    // moment the tool is torn down (see WorkspaceStateService.captureAndStore), not on this
    // function — it exists so the tool is still workspace-eligible for the restore() half below.
    return undefined;
  },

  restore(state): void {
    if (typeof state['token'] === 'string') {
      offerWorkspaceState(TOOL_ID, state);
    }
  },
};
