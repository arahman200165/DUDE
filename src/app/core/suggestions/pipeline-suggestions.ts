import { UsageLogEntry } from '../usage/usage.model';

/** Contiguous tool-open sequence lengths worth proposing — a pair or a triple, not longer chains. */
const SEQUENCE_LENGTHS = [2, 3] as const;
/** How many times the same sequence must repeat before it's worth surfacing as a suggestion. */
const MIN_OCCURRENCES = 3;
/** Consecutive opens further apart than this aren't considered "one workflow." */
const MAX_GAP_MS = 10 * 60 * 1000;

export interface PipelineSuggestionCandidate {
  readonly toolIds: readonly string[];
  readonly occurrences: number;
}

/** A stable, human-irrelevant key identifying a candidate sequence — used for dismissal tracking. */
export function suggestionKey(toolIds: readonly string[]): string {
  return toolIds.join('>');
}

function collapseConsecutiveDuplicates(log: readonly UsageLogEntry[]): readonly UsageLogEntry[] {
  const result: UsageLogEntry[] = [];
  for (const entry of log) {
    if (result.length === 0 || result[result.length - 1].toolId !== entry.toolId) result.push(entry);
  }
  return result;
}

function withinGap(window: readonly UsageLogEntry[]): boolean {
  for (let i = 1; i < window.length; i++) {
    if (new Date(window[i].at).getTime() - new Date(window[i - 1].at).getTime() > MAX_GAP_MS) return false;
  }
  return true;
}

/**
 * Pure scan of `UsageService.recentLogRaw()` for repeated adjacent tool-open sequences
 * (DUDE_PRD.md §21 Phase 24 Item 10). Only proposes sequences where every step is pipeline-eligible
 * (`pipelineEligibleIds`, from `PipelineStepRegistryService`), so "Save as pipeline" always lands in
 * an already-runnable draft — see `core/suggestions/AGENTS.md`.
 */
export function findPipelineSuggestions(
  log: readonly UsageLogEntry[],
  pipelineEligibleIds: ReadonlySet<string>,
  limit: number,
): readonly PipelineSuggestionCandidate[] {
  const collapsed = collapseConsecutiveDuplicates(log);
  const counts = new Map<string, PipelineSuggestionCandidate>();

  for (const length of SEQUENCE_LENGTHS) {
    for (let i = 0; i + length <= collapsed.length; i++) {
      const window = collapsed.slice(i, i + length);
      if (!withinGap(window)) continue;

      const toolIds = window.map((entry) => entry.toolId);
      if (!toolIds.every((id) => pipelineEligibleIds.has(id))) continue;

      const key = suggestionKey(toolIds);
      const existing = counts.get(key);
      counts.set(key, { toolIds, occurrences: (existing?.occurrences ?? 0) + 1 });
    }
  }

  return [...counts.values()]
    .filter((candidate) => candidate.occurrences >= MIN_OCCURRENCES)
    .sort((a, b) => b.occurrences - a.occurrences || b.toolIds.length - a.toolIds.length)
    .slice(0, limit);
}
