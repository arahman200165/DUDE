import { checkContrast, type WcagCompliance } from '@dude/tool-engine/tools/contrast-checker/contrast-checker-logic';
import { parseColor } from '@dude/tool-engine/tools/color-converter/color-convert';

export interface ContrastCheckRow { readonly key: string; readonly label: string; readonly pass: boolean }
export interface ContrastView {
  readonly ratio: number;
  readonly ratioText: string;
  readonly checks: readonly ContrastCheckRow[];
  readonly foreground: string;
  readonly background: string;
}
export type ContrastViewResult = { readonly ok: true; readonly view: ContrastView } | { readonly ok: false; readonly error: string };

export const formatRatio = (ratio: number): string => `${ratio.toFixed(2)}:1`;

export function checkRows(compliance: WcagCompliance): readonly ContrastCheckRow[] {
  return [
    { key: 'aa-normal', label: 'AA normal text (4.5:1)', pass: compliance.aaNormalText },
    { key: 'aa-large', label: 'AA large text (3:1)', pass: compliance.aaLargeText },
    { key: 'aaa-normal', label: 'AAA normal text (7:1)', pass: compliance.aaaNormalText },
    { key: 'aaa-large', label: 'AAA large text (4.5:1)', pass: compliance.aaaLargeText },
    { key: 'ui', label: 'UI components and icons (3:1)', pass: compliance.uiComponents },
  ];
}

/** Opaque `#rrggbb` for previewing (the engine ignores alpha too). Null when the text is not a color. */
export function previewHex(input: string): string | null {
  const parsed = parseColor(input);
  return parsed.ok ? parsed.formats.hex.slice(0, 7) : null;
}

export function contrastView(foreground: string, background: string): ContrastViewResult {
  const result = checkContrast(foreground, background);
  if (!result.ok) return result;
  return {
    ok: true,
    view: {
      ratio: result.ratio,
      ratioText: formatRatio(result.ratio),
      checks: checkRows(result.compliance),
      foreground: previewHex(foreground) ?? '#000000',
      background: previewHex(background) ?? '#ffffff',
    },
  };
}
