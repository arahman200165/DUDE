import { loadWorkspaceStep } from "../workspace/workspace-step-loader";
import { HistoryService } from './history.service';

/**
 * Turns a tool's teardown into a History entry, if it opted in. Called from `ToolShell`'s
 * `ngOnDestroy` — the one shared component every tool already renders through, so this fires
 * identically whether the tool was torn down by leaving its own route or by the Workspace swapping
 * a panel's tool (`shell/workspace/tool-host/`). See `core/history/AGENTS.md` for the eligibility
 * rule (`historyEligible` defaults to `false` — a tool with no `<id>.workspace-step.ts` adapter at
 * all is automatically excluded, at zero extra cost).
 */
export async function recordHistoryOnDestroy(toolId: string, history: HistoryService): Promise<void> {
  const step = await loadWorkspaceStep(toolId);
  if (!step?.historyEligible) return;

  const snapshot = step.snapshot();
  if (!snapshot) return;

  const summary = step.historySummary?.(snapshot.state) ?? snapshot.summary;
  await history.record(toolId, summary, snapshot.state);
}
