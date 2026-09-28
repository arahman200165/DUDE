/**
 * A read-only projection over four pre-existing stores (DUDE_PRD.md §21 Phase 24 Item 13) — never a
 * fifth independent recording mechanism. Each variant carries only an id + timestamp (+ whatever
 * tiny label the source already has for free); see `AGENTS.md` in this directory.
 */
export type UnifiedRecentEntry =
  | { readonly kind: 'tool'; readonly toolId: string; readonly title: string; readonly at: string }
  | { readonly kind: 'pipeline'; readonly pipelineId: string; readonly title: string; readonly at: string }
  | { readonly kind: 'workspace-tab'; readonly toolId: string; readonly title: string; readonly at: string }
  | { readonly kind: 'history'; readonly entryId: string; readonly toolId: string; readonly title: string; readonly at: string }
  | { readonly kind: 'native-file'; readonly path: string; readonly title: string; readonly at: string };

/**
 * Entries whose `at` is a real recorded event time. `workspace-tab` is excluded because its `at` is a
 * synthetic "now" (see `AGENTS.md`), which must never be shown as historical last-activity.
 */
export type UnifiedActivityEntry = Exclude<UnifiedRecentEntry, { readonly kind: 'workspace-tab' }>;

export function isActivityEntry(entry: UnifiedRecentEntry): entry is UnifiedActivityEntry {
  return entry.kind !== 'workspace-tab';
}
