import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from '../../../testing/property-harness';
import { computeStats } from './markdown-stats';
import { applyMarkdownInsertion, MarkdownInsertAction } from './markdown-toolbar-insert';
import { extractMarkdownLinks } from './markdown-link-extract';
import { buildWorkspaceResult } from './markdown-workspace-render';

const INSERT_ACTIONS: readonly MarkdownInsertAction[] = [
  'bold',
  'italic',
  'strikethrough',
  'inlineCode',
  'h1',
  'h2',
  'h3',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'link',
];

const sourceWithSelection = fc
  .string({ maxLength: 200 })
  .chain((source) =>
    fc.tuple(fc.constant(source), fc.integer({ min: 0, max: source.length }), fc.integer({ min: 0, max: source.length })),
  )
  .map(([source, a, b]) => ({ source, start: Math.min(a, b), end: Math.max(a, b) }));

describe('markdown-workspace property tests', () => {
  it('computeStats never throws and its character count always matches the input length', () => {
    invariant(
      (text: string) => computeStats(text),
      fc.string({ maxLength: 5000 }),
      (stats, text) => stats.characters === text.length && stats.words >= 0 && stats.readingTimeMinutes >= 0,
    );
  });

  it('applyMarkdownInsertion never throws and keeps the selection range within the resulting text', () => {
    neverThrows(
      (args: { source: string; start: number; end: number; action: MarkdownInsertAction }) =>
        applyMarkdownInsertion(args.source, args.start, args.end, args.action),
      fc
        .tuple(sourceWithSelection, fc.constantFrom(...INSERT_ACTIONS))
        .map(([s, action]) => ({ source: s.source, start: s.start, end: s.end, action })),
      {
        assertShape: (result) => {
          const { text, selectionStart, selectionEnd } = result as { text: string; selectionStart: number; selectionEnd: number };
          if (selectionStart < 0 || selectionEnd < selectionStart || selectionEnd > text.length) {
            throw new Error('selection range out of bounds');
          }
        },
      },
    );
  });

  it('extractMarkdownLinks never throws and only reports line numbers within the document', () => {
    invariant(
      (source: string) => ({ links: extractMarkdownLinks(source), lineCount: source.split('\n').length }),
      fc.string({ maxLength: 2000 }),
      ({ links, lineCount }) => links.every((link) => link.line >= 1 && link.line <= lineCount),
    );
  });

  it('buildWorkspaceResult never throws on arbitrary text, including malformed front matter', () => {
    neverThrows(
      (source: string) => buildWorkspaceResult(source),
      fc.string({ maxLength: 2000 }),
      {
        assertShape: (result) => {
          const { renderedHtmlRaw, stats } = result as { renderedHtmlRaw: string; stats: { characters: number } };
          if (typeof renderedHtmlRaw !== 'string') throw new Error('expected rendered HTML string');
          if (stats.characters < 0) throw new Error('expected non-negative character count');
        },
      },
    );
  });
});
