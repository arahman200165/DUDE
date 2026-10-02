import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { PipelineStepRegistryService } from './pipeline-step-registry.service';

/**
 * Quick Run's shared eligibility check (DUDE_PRD.md §21 Phase 24 Item 12, Phase 30D/30G) — scoped
 * to text-accepting steps only, exactly like the standalone `/quick-run` route already was. Used
 * by callers that already hold the full, eagerly-loaded `PipelineStepRegistryService` cache (the
 * `/quick-run` route itself); Home's compact Quick Run panel resolves its own small, bounded
 * candidate set on demand instead — see `shell/deck/quick-run-panel/quick-run-panel.ts`'s own doc
 * comment for why it deliberately does not force the same whole-registry load.
 */
export function textEligibleQuickRunToolIds(stepRegistry: PipelineStepRegistryService): readonly string[] {
  return stepRegistry.eligibleToolIds().filter((id) => stepRegistry.get(id)?.accepts.includes('text'));
}

/**
 * Runs an already-resolved pipeline step with a bare text input — the one execution
 * implementation every Quick Run surface shares, regardless of how each surface resolved the step.
 */
export async function runQuickRun(step: PipelineStep | undefined, input: string): Promise<PipelineStepResult | undefined> {
  if (!step) return undefined;
  return step.run({ type: 'text', value: input });
}
