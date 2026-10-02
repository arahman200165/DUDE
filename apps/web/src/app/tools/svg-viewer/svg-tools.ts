import { optimize } from 'svgo/browser';

/**
 * Pure, framework-free SVG format/minify/optimize helpers. Parsing mirrors
 * `xml-xpath-eval.ts`'s `DOMParser` + `parsererror` pattern.
 */

export type SvgTextResult = { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

function parseSvg(source: string): { ok: true; root: Element } | { ok: false; error: string } {
  const trimmed = source.trim();
  if (trimmed === '') return { ok: false, error: 'Enter SVG markup.' };

  const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) return { ok: false, error: parserError.textContent?.trim() || 'Could not parse this as SVG/XML.' };

  return { ok: true, root: doc.documentElement };
}

export function formatSvg(source: string, indentSize = 2): SvgTextResult {
  const parsed = parseSvg(source);
  if (!parsed.ok) return parsed;

  const serialized = new XMLSerializer().serializeToString(parsed.root);
  return { ok: true, output: prettyPrintXml(serialized, indentSize) };
}

export function minifySvg(source: string): SvgTextResult {
  const parsed = parseSvg(source);
  if (!parsed.ok) return parsed;

  const serialized = new XMLSerializer().serializeToString(parsed.root);
  return { ok: true, output: serialized.replace(/>\s+</g, '><').trim() };
}

export interface SvgOptimizeSuccess {
  readonly ok: true;
  readonly output: string;
  readonly originalBytes: number;
  readonly optimizedBytes: number;
}
export type SvgOptimizeResult = SvgOptimizeSuccess | { readonly ok: false; readonly error: string };

export function optimizeSvg(source: string): SvgOptimizeResult {
  const trimmed = source.trim();
  if (trimmed === '') return { ok: false, error: 'Enter SVG markup.' };

  try {
    const result = optimize(trimmed, { multipass: true });
    return {
      ok: true,
      output: result.data,
      originalBytes: new TextEncoder().encode(trimmed).length,
      optimizedBytes: new TextEncoder().encode(result.data).length,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not optimize this SVG.' };
  }
}

/** Naive but effective indenter for already-serialized, tag-per-line-able XML/SVG markup. */
function prettyPrintXml(xml: string, indentSize: number): string {
  const withBreaks = xml.replace(/>\s*</g, '>\n<');
  const pad = ' '.repeat(indentSize);
  let depth = 0;
  const out: string[] = [];

  for (const rawLine of withBreaks.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;

    const isClosingTag = /^<\//.test(line);
    const isVoidLike = /\/>$/.test(line) || /^<\?/.test(line) || /^<!--[\s\S]*-->$/.test(line);
    const isOpeningTag = /^<[^/!?][^>]*[^/]>$/.test(line) && !isVoidLike;

    if (isClosingTag) depth = Math.max(0, depth - 1);
    out.push(pad.repeat(depth) + line);
    if (isOpeningTag) depth += 1;
  }

  return out.join('\n');
}
