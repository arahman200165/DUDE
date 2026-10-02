import { applyMarkdownInsertion } from "./markdown-toolbar-insert.js";

describe('applyMarkdownInsertion', () => {
  it('wraps a selection in bold markers and selects the wrapped text', () => {
    const result = applyMarkdownInsertion('hello world', 6, 11, 'bold');
    expect(result.text).toBe('hello **world**');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('world');
  });

  it('inserts a placeholder and selects it when there is no selection', () => {
    const result = applyMarkdownInsertion('hello ', 6, 6, 'italic');
    expect(result.text).toBe('hello *italic text*');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('italic text');
  });

  it('applies strikethrough markers', () => {
    const result = applyMarkdownInsertion('abc', 0, 3, 'strikethrough');
    expect(result.text).toBe('~~abc~~');
  });

  it('applies inline code markers', () => {
    const result = applyMarkdownInsertion('abc', 0, 3, 'inlineCode');
    expect(result.text).toBe('`abc`');
  });

  it('prefixes a single line with a heading marker', () => {
    const result = applyMarkdownInsertion('Title', 0, 5, 'h2');
    expect(result.text).toBe('## Title');
  });

  it('prefixes every line of a multi-line selection', () => {
    const result = applyMarkdownInsertion('one\ntwo\nthree', 0, 13, 'bulletList');
    expect(result.text).toBe('- one\n- two\n- three');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('- one\n- two\n- three');
  });

  it('applies an ordered-list prefix to each line (repeated "1." is valid CommonMark)', () => {
    const result = applyMarkdownInsertion('a\nb', 0, 3, 'orderedList');
    expect(result.text).toBe('1. a\n1. b');
  });

  it('applies a task-list prefix', () => {
    const result = applyMarkdownInsertion('todo', 0, 4, 'taskList');
    expect(result.text).toBe('- [ ] todo');
  });

  it('applies a blockquote prefix', () => {
    const result = applyMarkdownInsertion('quoted', 0, 6, 'blockquote');
    expect(result.text).toBe('> quoted');
  });

  it('wraps a selection in a fenced code block', () => {
    const result = applyMarkdownInsertion('const x = 1;', 0, 12, 'codeBlock');
    expect(result.text).toBe('```\nconst x = 1;\n```');
  });

  it('inserts a link with the URL placeholder selected last', () => {
    const result = applyMarkdownInsertion('', 0, 0, 'link');
    expect(result.text).toBe('[link text](https://)');
  });

  it('preserves text before and after the selection', () => {
    const result = applyMarkdownInsertion('before MIDDLE after', 7, 13, 'bold');
    expect(result.text).toBe('before **MIDDLE** after');
  });
});
