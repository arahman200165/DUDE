/**
 * Pure, framework-free common-prefix/common-suffix diff, turning a browser
 * textarea's "here's the whole new value" input event into a minimal
 * insert/delete op. Yjs's CRDT merge quality (and the ability for other
 * participants to see fine-grained edits rather than a wholesale replace)
 * depends on applying small ops, not the full text on every keystroke.
 */

export interface TextDelta {
  readonly index: number;
  readonly deleteCount: number;
  readonly insertText: string;
}

export function computeTextDelta(oldText: string, newText: string): TextDelta {
  if (oldText === newText) return { index: 0, deleteCount: 0, insertText: '' };

  const maxPrefix = Math.min(oldText.length, newText.length);
  let prefixLength = 0;
  while (prefixLength < maxPrefix && oldText[prefixLength] === newText[prefixLength]) prefixLength++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > prefixLength && newEnd > prefixLength && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return { index: prefixLength, deleteCount: oldEnd - prefixLength, insertText: newText.slice(prefixLength, newEnd) };
}
