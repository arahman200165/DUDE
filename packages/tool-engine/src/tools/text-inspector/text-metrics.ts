/**
 * Pure, framework-free text metrics used by the Text Inspector tool.
 */

export interface TextMetrics {
  readonly characterCount: number;
  readonly codePointCount: number;
  readonly wordCount: number;
  readonly lineCount: number;
  readonly byteCount: number;
  readonly whitespaceCount: number;
}

const encoder = new TextEncoder();

export function computeTextMetrics(text: string): TextMetrics {
  const trimmed = text.trim();

  return {
    characterCount: text.length,
    codePointCount: Array.from(text).length,
    wordCount: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    lineCount: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
    byteCount: encoder.encode(text).length,
    whitespaceCount: text.match(/\s/g)?.length ?? 0,
  };
}

/** Returns `null` when there is no active selection (start === end). */
export function computeSelectionMetrics(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): TextMetrics | null {
  if (selectionStart === selectionEnd) return null;
  return computeTextMetrics(text.slice(selectionStart, selectionEnd));
}
