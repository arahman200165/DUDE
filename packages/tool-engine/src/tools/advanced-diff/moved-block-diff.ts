import { DiffHunk } from "./diff-hunks.js";

export interface MovedBlockAnnotation {
  readonly movedTo?: number;
  readonly movedFrom?: number;
}

const DEFAULT_MIN_LINES = 2;
const MAX_HUNKS = 500;

/**
 * Annotates remove-only/add-only hunk pairs whose content is an exact match as a "moved block"
 * rather than an unrelated delete+add. Purely informational -- doesn't change merge/accept
 * semantics. Skips detection entirely above `MAX_HUNKS` hunks to avoid an O(hunks^2) scan on huge
 * diffs, and ignores blocks shorter than `minLines` to avoid flagging trivial one-line coincidences
 * (a lone `}`, a blank line) as a move. Exact-match only in v1 -- no fuzzy matching.
 */
export function detectMovedBlocks(hunks: readonly DiffHunk[], minLines = DEFAULT_MIN_LINES): ReadonlyMap<number, MovedBlockAnnotation> {
  const annotations = new Map<number, MovedBlockAnnotation>();
  if (hunks.length > MAX_HUNKS) return annotations;

  const removedOnly = hunks.filter((h) => h.removedLines.length >= minLines && h.addedLines.length === 0);
  const addedOnly = hunks.filter((h) => h.addedLines.length >= minLines && h.removedLines.length === 0);

  for (const source of removedOnly) {
    const sourceKey = source.removedLines.join('\n');
    for (const destination of addedOnly) {
      if (annotations.has(destination.index)) continue;
      if (destination.addedLines.join('\n') !== sourceKey) continue;

      annotations.set(source.index, { ...annotations.get(source.index), movedTo: destination.index });
      annotations.set(destination.index, { ...annotations.get(destination.index), movedFrom: source.index });
      break;
    }
  }

  return annotations;
}
