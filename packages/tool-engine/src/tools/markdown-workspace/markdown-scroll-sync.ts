/**
 * Percentage-based scroll sync between the source textarea and the rendered
 * preview pane. Deliberately not line-accurate (that would require mapping
 * source line ranges to rendered DOM offsets) — an accepted "ship first"
 * limitation (PRD Section 18) that will visibly drift when one pane's
 * content is proportionally much taller than the other's (e.g. a wide
 * table), but works well for the common case.
 */
export function computeSyncedScrollTop(
  sourceScrollTop: number,
  sourceScrollHeight: number,
  sourceClientHeight: number,
  targetScrollHeight: number,
  targetClientHeight: number,
): number {
  const sourceMax = sourceScrollHeight - sourceClientHeight;
  const targetMax = targetScrollHeight - targetClientHeight;
  if (sourceMax <= 0 || targetMax <= 0) return 0;

  const ratio = Math.min(1, Math.max(0, sourceScrollTop / sourceMax));
  return ratio * targetMax;
}
