import { UnifiedRecentEntry } from "@dude/domain/core/recents/unified-recents.model";

const MAX_ENTRIES = 50;

function keyOf(entry: UnifiedRecentEntry): string {
  switch (entry.kind) {
    case 'tool':
      return `tool:${entry.toolId}`;
    case 'pipeline':
      return `pipeline:${entry.pipelineId}`;
    case 'workspace-tab':
      return `workspace-tab:${entry.toolId}`;
    case 'history':
      return `history:${entry.entryId}`;
    case 'native-file':
      return `native-file:${entry.path}`;
  }
}

/** Keeps only the most recent instance of each (kind, id) pair — a toolId can legitimately appear
 *  many times in a raw usage log; the other three sources are already 1-per-id by construction. */
function dedupeKeepLatest(entries: readonly UnifiedRecentEntry[]): readonly UnifiedRecentEntry[] {
  const byKey = new Map<string, UnifiedRecentEntry>();
  for (const entry of entries) {
    const existing = byKey.get(keyOf(entry));
    if (!existing || entry.at > existing.at) byKey.set(keyOf(entry), entry);
  }
  return [...byKey.values()];
}

/**
 * Pure merge/dedupe/sort over four already-existing sources (DUDE_PRD.md §21 Phase 24 Item 13) —
 * never a fifth recording mechanism. Kept separate from the Angular service so it's trivially
 * testable with synthetic entries. See `AGENTS.md` in this directory.
 */
export function mergeUnifiedRecents(...sources: readonly (readonly UnifiedRecentEntry[])[]): readonly UnifiedRecentEntry[] {
  const deduped = dedupeKeepLatest(sources.flat());
  return [...deduped].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX_ENTRIES);
}
