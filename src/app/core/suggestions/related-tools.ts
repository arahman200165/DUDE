import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { canChain } from '../pipeline/pipeline-compatibility';

/**
 * Pure ranking over already-declared registry metadata (DUDE_PRD.md §21 Phase 24 Item 9) — never a
 * new capability. Only tools `current` could feed (`current.io.produces` overlaps `candidate.io.accepts`,
 * via the same `canChain` Pipelines already uses) count as "related" — "next useful action," not
 * "anything vaguely similar." Ranked by: (1) both tools have a loaded `PipelineStep` (a genuine
 * "chain it" affordance, not just a declared-but-unverified `io` match), (2) usage frequency as a
 * tiebreaker, (3) title for full determinism. `pipelineEligibleIds` and `frequencyOf` are passed in
 * rather than injected so this stays a plain, framework-free, trivially-testable function.
 */
export function relatedTools(
  current: ToolDefinition,
  all: readonly ToolDefinition[],
  pipelineEligibleIds: ReadonlySet<string>,
  frequencyOf: (toolId: string) => number,
  limit: number,
): readonly ToolDefinition[] {
  const candidates = all.filter((tool) => tool.id !== current.id && canChain(current.io, tool.io));
  const bothPipelineEligible = (tool: ToolDefinition) =>
    pipelineEligibleIds.has(current.id) && pipelineEligibleIds.has(tool.id);

  return [...candidates]
    .sort((a, b) => {
      const boostA = bothPipelineEligible(a) ? 1 : 0;
      const boostB = bothPipelineEligible(b) ? 1 : 0;
      if (boostA !== boostB) return boostB - boostA;

      const freqDiff = frequencyOf(b.id) - frequencyOf(a.id);
      if (freqDiff !== 0) return freqDiff;

      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
