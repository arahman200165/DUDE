import { toSVG } from 'bwip-js/generic';
import { validateBarcodeValue, type BarcodeFormat } from './barcode-validate.js';

/**
 * Portable barcode rendering shared by the web tool and the Android app. `bwip-js/generic` is
 * the platform-neutral entry: it needs no canvas, DOM or Node built-ins and emits an SVG string
 * with every glyph already converted to paths, so output is identical on every host.
 *
 * The SVG is always black bars on an explicit white rectangle (never `currentColor`): a barcode
 * must stay scannable regardless of the surrounding theme.
 */

export type BarcodeSymbology =
  | 'code128'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'code39'
  | 'itf14'
  | 'codabar'
  | 'datamatrix'
  | 'pdf417'
  | 'azteccode'
  | 'gs1-128';

export type BarcodeKind = 'linear' | 'matrix';

export interface BarcodeSymbologyInfo {
  readonly id: BarcodeSymbology;
  readonly label: string;
  /** The bwip-js / BWIPP encoder id. */
  readonly bcid: string;
  readonly kind: BarcodeKind;
  /** A value that always renders, shown when the user switches to this symbology. */
  readonly sample: string;
  readonly hint: string;
  /** The legacy (jsbarcode-era) format name whose GS1 validation applies, if any. */
  readonly legacyFormat?: BarcodeFormat;
}

export const BARCODE_SYMBOLOGIES: readonly BarcodeSymbologyInfo[] = [
  { id: 'code128', label: 'Code 128', bcid: 'code128', kind: 'linear', sample: '123456789012', hint: 'Any ASCII text.', legacyFormat: 'CODE128' },
  { id: 'ean13', label: 'EAN-13', bcid: 'ean13', kind: 'linear', sample: '5901234123457', hint: '12 digits, or 13 with the check digit.', legacyFormat: 'EAN13' },
  { id: 'ean8', label: 'EAN-8', bcid: 'ean8', kind: 'linear', sample: '40123455', hint: '7 digits, or 8 with the check digit.', legacyFormat: 'EAN8' },
  { id: 'upca', label: 'UPC-A', bcid: 'upca', kind: 'linear', sample: '036000291452', hint: '11 digits, or 12 with the check digit.', legacyFormat: 'UPC' },
  { id: 'upce', label: 'UPC-E', bcid: 'upce', kind: 'linear', sample: '01234565', hint: '7 or 8 digits.' },
  { id: 'code39', label: 'Code 39', bcid: 'code39', kind: 'linear', sample: 'CODE39', hint: 'Digits, capital letters, space and - . $ / + %.', legacyFormat: 'CODE39' },
  { id: 'itf14', label: 'ITF-14', bcid: 'itf14', kind: 'linear', sample: '12345678901231', hint: '13 or 14 digits.', legacyFormat: 'ITF14' },
  { id: 'codabar', label: 'Codabar', bcid: 'rationalizedCodabar', kind: 'linear', sample: 'A123456B', hint: 'Digits and - $ : / . +; A-D start and stop are added when missing.', legacyFormat: 'codabar' },
  { id: 'gs1-128', label: 'GS1-128', bcid: 'gs1-128', kind: 'linear', sample: '(01)09506000134352(17)201225(10)ABC123', hint: 'Application identifiers in parentheses, with valid GS1 check digits.' },
  { id: 'datamatrix', label: 'Data Matrix', bcid: 'datamatrix', kind: 'matrix', sample: 'Hello, DUDE', hint: 'Any text, up to a few thousand characters.' },
  { id: 'pdf417', label: 'PDF417', bcid: 'pdf417', kind: 'matrix', sample: 'Hello, DUDE', hint: 'Any text, up to roughly 1800 characters.' },
  { id: 'azteccode', label: 'Aztec', bcid: 'azteccode', kind: 'matrix', sample: 'Hello, DUDE', hint: 'Any text, up to a few thousand characters.' },
];

const BY_ID: ReadonlyMap<string, BarcodeSymbologyInfo> = new Map(BARCODE_SYMBOLOGIES.map((info) => [info.id, info]));

/** Old jsbarcode-era persisted `format` values, plus lenient spellings, mapped to the new ids. */
const LEGACY_ALIASES: Readonly<Record<string, BarcodeSymbology>> = {
  code128: 'code128',
  ean13: 'ean13',
  ean8: 'ean8',
  upc: 'upca',
  upca: 'upca',
  upce: 'upce',
  code39: 'code39',
  itf14: 'itf14',
  codabar: 'codabar',
  datamatrix: 'datamatrix',
  pdf417: 'pdf417',
  azteccode: 'azteccode',
  aztec: 'azteccode',
  'gs1-128': 'gs1-128',
  gs1128: 'gs1-128',
};

export const DEFAULT_BARCODE_SYMBOLOGY: BarcodeSymbology = 'code128';

/** Maps a persisted or typed format name (old `CODE128`, `UPC`, `codabar`, ...) to a symbology, or `null`. */
export function normalizeBarcodeSymbology(value: unknown): BarcodeSymbology | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s_]/g, '');
  const direct = LEGACY_ALIASES[key] ?? LEGACY_ALIASES[key.replace(/-/g, '')];
  return direct ?? null;
}

export function barcodeSymbologyInfo(symbology: BarcodeSymbology): BarcodeSymbologyInfo {
  return BY_ID.get(symbology) as BarcodeSymbologyInfo;
}

export interface BarcodeRenderInput {
  readonly symbology: BarcodeSymbology;
  readonly text: string;
  /** Pixels per module, 1-10 (default 2). */
  readonly scale?: number;
  /** Bar height in millimetres for linear symbologies, 5-60 (default 15). */
  readonly height?: number;
  /** Draw the human-readable text under linear symbologies (default true). */
  readonly includeText?: boolean;
  /** Quiet-zone padding around the symbol in points (scaled), 0-50 (default 10). */
  readonly padding?: number;
}

export type BarcodeRenderResult =
  | { readonly ok: true; readonly svg: string; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly error: string };

export const MAX_BARCODE_TEXT_LENGTH = 3000;

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const cleaned = raw.replace(/^bwipp\.[A-Za-z0-9_]+#\d+:\s*/, '').trim();
  return cleaned === '' ? 'Could not generate this barcode.' : cleaned;
}

function prepareText(info: BarcodeSymbologyInfo, trimmed: string): string {
  if (info.id === 'code39') return trimmed.toUpperCase();
  if (info.id === 'codabar') {
    const upper = trimmed.toUpperCase();
    return /^[A-D]/.test(upper) ? upper : `A${upper}B`;
  }
  return trimmed;
}

/**
 * Renders a barcode to an SVG string (black on white). The input is validated first: the GS1
 * check-digit symbologies keep the messages of `validateBarcodeValue`, and any encoder error is
 * turned into a short readable message. Never throws.
 */
export function renderBarcodeSvg(input: BarcodeRenderInput): BarcodeRenderResult {
  const info = BY_ID.get(input.symbology);
  if (!info) return { ok: false, error: 'Unsupported barcode format.' };

  const trimmed = (input.text ?? '').trim();
  if (info.legacyFormat) {
    const validation = validateBarcodeValue(info.legacyFormat, trimmed);
    if (!validation.ok) return { ok: false, error: validation.message ?? 'Invalid barcode value.' };
  } else if (trimmed === '') {
    return { ok: false, error: 'Enter a value.' };
  }
  if (trimmed.length > MAX_BARCODE_TEXT_LENGTH) {
    return { ok: false, error: `Value is too long (maximum ${MAX_BARCODE_TEXT_LENGTH} characters).` };
  }

  try {
    const scale = Math.round(clamp(input.scale, 1, 10, 2));
    const svg = toSVG({
      bcid: info.bcid,
      text: prepareText(info, trimmed),
      scale,
      padding: Math.round(clamp(input.padding, 0, 50, 10)),
      barcolor: '000000',
      backgroundcolor: 'FFFFFF',
      ...(info.kind === 'linear' ? { height: clamp(input.height, 5, 60, 15), includetext: input.includeText ?? true } : {}),
    });

    const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
    if (!box) return { ok: false, error: 'Could not generate this barcode.' };
    const width = Number(box[1]);
    const height = Number(box[2]);
    const sized = svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
    return { ok: true, svg: sized, width, height };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

/** An `<img src>`-safe data URL for a generated SVG. Percent-encoded, so it needs no `btoa`. */
export function barcodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
