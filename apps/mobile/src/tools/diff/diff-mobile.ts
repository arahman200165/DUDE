/** Android per-side input cap (characters). The line diff itself is fast; this bounds memory and the rendered output. */
export const MAX_SIDE_CHARS = 512 * 1024;

export function summaryText(added: number, removed: number, unchanged: number): string {
  if (added === 0 && removed === 0) return `No differences (${unchanged.toLocaleString('en-US')} unchanged)`;
  return `${added.toLocaleString('en-US')} added, ${removed.toLocaleString('en-US')} removed, ${unchanged.toLocaleString('en-US')} unchanged`;
}

export function oversizeMessage(left: number, right: number): string | null {
  const side = left > MAX_SIDE_CHARS ? 'Left' : right > MAX_SIDE_CHARS ? 'Right' : null;
  return side ? `${side} text is over ${MAX_SIDE_CHARS / 1024} KiB. Diff on Android compares at most ${MAX_SIDE_CHARS / 1024} KiB per side.` : null;
}
