/**
 * Pure, framework-free Markdown syntax insertion against a plain-text
 * source and a selection range — used by the workspace's insertion
 * toolbar. Distinct in kind from the separate WYSIWYG editor tool: this
 * stays a plain-text source editor with insertion helpers, never a rich
 * contenteditable surface.
 */

export type MarkdownInsertAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'link';

export interface MarkdownInsertResult {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

function wrapInline(before: string, selected: string, after: string, open: string, close: string, placeholder: string): MarkdownInsertResult {
  const content = selected !== '' ? selected : placeholder;
  const text = before + open + content + close + after;
  const start = before.length + open.length;
  return { text, selectionStart: start, selectionEnd: start + content.length };
}

function prefixLines(before: string, selected: string, after: string, prefix: string): MarkdownInsertResult {
  const content = selected !== '' ? selected : 'text';
  const inserted = content
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
  const text = before + inserted + after;
  return { text, selectionStart: before.length, selectionEnd: before.length + inserted.length };
}

export function applyMarkdownInsertion(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  action: MarkdownInsertAction,
): MarkdownInsertResult {
  const before = source.slice(0, selectionStart);
  const selected = source.slice(selectionStart, selectionEnd);
  const after = source.slice(selectionEnd);

  switch (action) {
    case 'bold':
      return wrapInline(before, selected, after, '**', '**', 'bold text');
    case 'italic':
      return wrapInline(before, selected, after, '*', '*', 'italic text');
    case 'strikethrough':
      return wrapInline(before, selected, after, '~~', '~~', 'strikethrough text');
    case 'inlineCode':
      return wrapInline(before, selected, after, '`', '`', 'code');
    case 'link':
      return wrapInline(before, selected, after, '[', '](https://)', 'link text');
    case 'h1':
      return prefixLines(before, selected, after, '# ');
    case 'h2':
      return prefixLines(before, selected, after, '## ');
    case 'h3':
      return prefixLines(before, selected, after, '### ');
    case 'bulletList':
      return prefixLines(before, selected, after, '- ');
    case 'orderedList':
      return prefixLines(before, selected, after, '1. ');
    case 'taskList':
      return prefixLines(before, selected, after, '- [ ] ');
    case 'blockquote':
      return prefixLines(before, selected, after, '> ');
    case 'codeBlock':
      return wrapInline(before, selected, after, '```\n', '\n```', 'code');
  }
}
