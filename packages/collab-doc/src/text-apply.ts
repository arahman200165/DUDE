import type * as Y from 'yjs';
import { textHunks } from '@dude/sync';

/**
 * Brings `ytext` to `next` with a minimal multi-hunk edit (deletes then inserts, right to left, in one transaction).
 * Unlike a prefix/suffix replace this leaves every unchanged region between hunks untouched, so a concurrent remote
 * edit made elsewhere in the text survives. Indices are UTF-16 units and a surrogate pair is never split. Returns
 * whether anything changed.
 */
export function applyTextTo(ytext: Y.Text, next: string, origin?: unknown): boolean {
  const hunks = textHunks(ytext.toString(), next);
  if (hunks.length === 0) return false;
  const run = (): void => {
    for (const hunk of hunks) {
      if (hunk.deleteCount > 0) ytext.delete(hunk.at, hunk.deleteCount);
      if (hunk.insert.length > 0) ytext.insert(hunk.at, hunk.insert);
    }
  };
  if (ytext.doc) ytext.doc.transact(run, origin);
  else run();
  return true;
}
