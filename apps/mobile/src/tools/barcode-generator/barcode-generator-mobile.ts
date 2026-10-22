import {
  BARCODE_SYMBOLOGIES, barcodeSymbologyInfo, normalizeBarcodeSymbology, type BarcodeSymbology,
} from '@dude/tool-engine/tools/barcode-generator/barcode-render';

/** Same scale choices as the web tool. The persisted `scale` key holds the number. */
export const SCALES: readonly number[] = [1, 2, 3, 4, 6, 8];
export const DEFAULT_SCALE = 2;
export const MAX_PREVIEW_UPSCALE = 3;

/** Decodes the persisted `format` key (accepts the old jsbarcode names, like web). */
export const decodeFormat = (raw: unknown): BarcodeSymbology | null => normalizeBarcodeSymbology(raw);
export const decodeScale = (raw: unknown): number | null => typeof raw === 'number' && SCALES.includes(raw) ? raw : null;
export const decodeIncludeText = (raw: unknown): boolean | null => typeof raw === 'boolean' ? raw : null;

/**
 * The web tool offers the new symbology's sample when the current value is empty or still another symbology's sample.
 * Returns the value to use after switching, or null to keep what the user typed.
 */
export function valueAfterSymbologyChange(current: string, next: BarcodeSymbology): string | null {
  if (current.trim() === '' || BARCODE_SYMBOLOGIES.some(item => item.sample === current)) return barcodeSymbologyInfo(next).sample;
  return null;
}

/** Display size: the natural SVG size, enlarged up to 3x but never wider than the space available. */
export function previewSize(width: number, height: number, available: number): { readonly width: number; readonly height: number } {
  const factor = Math.min(MAX_PREVIEW_UPSCALE, available / width);
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

export const fileNameFor = (symbology: BarcodeSymbology, extension: 'svg' | 'png'): string => `barcode-${symbology}.${extension}`;
