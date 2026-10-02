import { colord } from 'colord';

export interface WcagCompliance {
  readonly aaNormalText: boolean;
  readonly aaLargeText: boolean;
  readonly aaaNormalText: boolean;
  readonly aaaLargeText: boolean;
  readonly uiComponents: boolean;
}

export type ContrastResult =
  | { readonly ok: true; readonly ratio: number; readonly compliance: WcagCompliance }
  | { readonly ok: false; readonly error: string };

function relativeLuminanceChannel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * relativeLuminanceChannel(r) + 0.7152 * relativeLuminanceChannel(g) + 0.0722 * relativeLuminanceChannel(b);
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fg = colord(foregroundHex).toRgb();
  const bg = colord(backgroundHex).toRgb();
  const lFg = relativeLuminance(fg.r, fg.g, fg.b);
  const lBg = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function wcagCompliance(ratio: number): WcagCompliance {
  return {
    aaNormalText: ratio >= 4.5,
    aaLargeText: ratio >= 3,
    aaaNormalText: ratio >= 7,
    aaaLargeText: ratio >= 4.5,
    uiComponents: ratio >= 3,
  };
}

export function checkContrast(foreground: string, background: string): ContrastResult {
  const fg = colord(foreground);
  const bg = colord(background);

  if (!fg.isValid()) return { ok: false, error: `Could not recognize "${foreground}" as a color.` };
  if (!bg.isValid()) return { ok: false, error: `Could not recognize "${background}" as a color.` };

  const ratio = contrastRatio(foreground, background);
  return { ok: true, ratio, compliance: wcagCompliance(ratio) };
}
