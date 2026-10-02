/**
 * Contract for a Smart Paste-Detection shape recognizer (`DUDE_PRD.md` §21 Phase 21 Item 3).
 * Deliberately not a per-tool `<id>.paste-detect.ts` convention file like Pipelines' `PipelineStep`
 * — see `apps/web/src/app/core/paste-detect/AGENTS.md` for why detection needs a different resolution
 * strategy than pipeline steps do.
 */
export interface PasteDetector {
  readonly toolId: string;
  /** 0–1 confidence that `text` is this shape, or `null` for "no match." Never throws. */
  test(text: string): number | null;
}

export interface PasteDetectionMatch {
  readonly toolId: string;
  readonly title: string;
  readonly score: number;
}
