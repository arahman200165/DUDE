import { WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { WORKSPACE_STEP_LOADERS } from '../registry/tool-loaders.generated';

/**
 * Resolves tool `id`'s workspace-step purely by naming convention — never via a hand-maintained
 * field on `ToolDefinition` or a parallel `id -> step` map (mirrors `core/pipeline/pipeline-step-loader.ts`'s
 * `loadPipelineStep`; see `AGENTS.md` in this directory). Returns `undefined` for a tool with no
 * `<id>.workspace-step.ts` file, which is a normal, expected outcome, not an error — that tool
 * simply isn't eligible for live state mirroring or Local History.
 *
 * `core/history/` reuses this same loader rather than defining its own — one adapter file, one
 * dynamic-import site per tool, shared by both features.
 */
export async function loadWorkspaceStep(id: string): Promise<WorkspaceStep | undefined> {
  try {
    return await WORKSPACE_STEP_LOADERS[id]?.();
  } catch {
    return undefined;
  }
}
