import { DiffResult } from "../diff/text-diff.js";
import { FineDiffResult } from "./char-word-diff.js";
import { ThreeWayMergeResult } from "./three-way-merge.js";
import { TreeDiffResult } from "./object-tree-diff.js";

export type SemanticDiffOutcome = { readonly ok: true; readonly result: TreeDiffResult } | { readonly ok: false; readonly error: string };

export interface AdvancedDiffResult {
  /** Always computed — the merge view and unified-diff export are both line-oriented, even in char/word or semantic display mode. */
  readonly lineDiff: DiffResult;
  /** Present only when `granularity` is `'char'` or `'word'` — a display-only refinement over the line diff. */
  readonly fineDiff?: FineDiffResult;
  /** Present only when `mode` is a semantic mode — either a structural diff, or a parse error (line diff remains the fallback view). */
  readonly semanticDiff?: SemanticDiffOutcome;
  /** Present only when the request included a `base` — three-way merge hunks. */
  readonly threeWayMerge?: ThreeWayMergeResult;
}
