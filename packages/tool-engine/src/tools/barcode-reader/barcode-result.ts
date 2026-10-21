/**
 * Pure, DOM-free interpretation of a decoded barcode (Phase 31I): symbology-name normalisation across
 * decoder libraries (ZXing `EAN_13`, ML Kit/vision-camera `ean-13`, AVFoundation `org.gs1.EAN-13`, ...),
 * GS1 check-digit validation and GTIN/ISBN derivation. The decoding itself stays in the host app.
 * Reuses `computeCheckDigit` from the Barcode Generator and `classifyScanPayload` from the QR Code
 * Scanner rather than duplicating them.
 */
import { computeCheckDigit } from '../barcode-generator/barcode-validate.js';
import { classifyScanPayload, type ScanPayload } from '../qr-code-scanner/scan-payload.js';

export type BarcodeSymbology =
  | 'qr'
  | 'aztec'
  | 'codabar'
  | 'code39'
  | 'code93'
  | 'code128'
  | 'datamatrix'
  | 'ean8'
  | 'ean13'
  | 'itf'
  | 'itf14'
  | 'maxicode'
  | 'pdf417'
  | 'upca'
  | 'upce'
  | 'gs1-databar'
  | 'gs1-databar-expanded'
  | 'unknown';

interface SymbologyInfo {
  readonly label: string;
  readonly twoDimensional: boolean;
}

const SYMBOLOGIES: Record<BarcodeSymbology, SymbologyInfo> = {
  qr: { label: 'QR Code', twoDimensional: true },
  aztec: { label: 'Aztec', twoDimensional: true },
  codabar: { label: 'Codabar', twoDimensional: false },
  code39: { label: 'Code 39', twoDimensional: false },
  code93: { label: 'Code 93', twoDimensional: false },
  code128: { label: 'Code 128', twoDimensional: false },
  datamatrix: { label: 'Data Matrix', twoDimensional: true },
  ean8: { label: 'EAN-8', twoDimensional: false },
  ean13: { label: 'EAN-13', twoDimensional: false },
  itf: { label: 'ITF', twoDimensional: false },
  itf14: { label: 'ITF-14', twoDimensional: false },
  maxicode: { label: 'MaxiCode', twoDimensional: true },
  pdf417: { label: 'PDF417', twoDimensional: true },
  upca: { label: 'UPC-A', twoDimensional: false },
  upce: { label: 'UPC-E', twoDimensional: false },
  'gs1-databar': { label: 'GS1 DataBar', twoDimensional: false },
  'gs1-databar-expanded': { label: 'GS1 DataBar Expanded', twoDimensional: true },
  unknown: { label: 'Unknown', twoDimensional: false },
};

/** Keyed by the lower-cased format name with every non-alphanumeric character removed. */
const ALIASES: Record<string, BarcodeSymbology> = {
  qr: 'qr',
  qrcode: 'qr',
  aztec: 'aztec',
  azteccode: 'aztec',
  codabar: 'codabar',
  code39: 'code39',
  code93: 'code93',
  code128: 'code128',
  datamatrix: 'datamatrix',
  ean8: 'ean8',
  ean13: 'ean13',
  itf: 'itf',
  interleaved2of5: 'itf',
  itf14: 'itf14',
  maxicode: 'maxicode',
  pdf417: 'pdf417',
  upca: 'upca',
  upc: 'upca',
  upce: 'upce',
  rss14: 'gs1-databar',
  gs1databar: 'gs1-databar',
  databar: 'gs1-databar',
  rssexpanded: 'gs1-databar-expanded',
  gs1databarexpanded: 'gs1-databar-expanded',
  databarexpanded: 'gs1-databar-expanded',
};

/** Maps any decoder's format name (any case, separators or `org.gs1.` style prefix) to a canonical symbology. */
export function normalizeBarcodeFormat(name: string | null | undefined): BarcodeSymbology {
  if (!name) return 'unknown';
  const key = name
    .toLowerCase()
    .replace(/^org\.(?:gs1|iso|iec)\./, '')
    .replace(/[^a-z0-9]/g, '');
  return ALIASES[key] ?? 'unknown';
}

export function barcodeSymbologyLabel(symbology: BarcodeSymbology): string {
  return SYMBOLOGIES[symbology].label;
}

export function isTwoDimensionalSymbology(symbology: BarcodeSymbology): boolean {
  return SYMBOLOGIES[symbology].twoDimensional;
}

export interface CheckDigitResult {
  readonly valid: boolean;
  readonly expected: number;
  readonly actual: number;
}

const GTIN_LENGTHS: Partial<Record<BarcodeSymbology, number>> = { ean8: 8, ean13: 13, upca: 12, itf14: 14 };

/**
 * Verifies the GS1 mod-10 check digit of an EAN-8, EAN-13, UPC-A or ITF-14 value. `null` when the
 * symbology carries no GS1 check digit, or the value is not digits of the right length.
 */
export function verifyGs1CheckDigit(symbology: BarcodeSymbology, value: string): CheckDigitResult | null {
  const length = GTIN_LENGTHS[symbology];
  if (length === undefined || value.length !== length || !/^\d+$/.test(value)) return null;
  const expected = computeCheckDigit(value.slice(0, -1));
  const actual = Number(value[value.length - 1]);
  return { valid: expected === actual, expected, actual };
}

export interface BarcodeResult {
  readonly symbology: BarcodeSymbology;
  readonly label: string;
  readonly twoDimensional: boolean;
  readonly text: string;
  /** Present for EAN-8/EAN-13/UPC-A/ITF-14 values of the right length. */
  readonly checkDigit: CheckDigitResult | null;
  /** The 14-digit GTIN, only when the check digit is valid. */
  readonly gtin14: string | null;
  /** ISBN-13 (EAN-13 with a 978/979 prefix and a valid check digit). */
  readonly isbn13: string | null;
  /** Classification of the decoded text (URL, Wi-Fi, otpauth, ...), most useful for 2D symbologies. */
  readonly payload: ScanPayload;
  readonly sensitive: boolean;
}

/** Interprets one decoded barcode: normalises the format name, checks GS1 digits and classifies the text. */
export function interpretBarcode(decoded: string, formatName?: string | null): BarcodeResult {
  const symbology = normalizeBarcodeFormat(formatName);
  const info = SYMBOLOGIES[symbology];
  const text = decoded.trim();
  // ZXing reports ITF-14 as plain `ITF`; a 14-digit ITF value is a GTIN-14.
  const checkDigit = verifyGs1CheckDigit(symbology === 'itf' && text.length === 14 ? 'itf14' : symbology, text);
  const gtin14 = checkDigit?.valid ? text.padStart(14, '0') : null;
  const isbn13 = symbology === 'ean13' && checkDigit?.valid && /^97[89]/.test(text) ? text : null;
  const payload = classifyScanPayload(decoded);
  return {
    symbology,
    label: info.label,
    twoDimensional: info.twoDimensional,
    text: decoded,
    checkDigit,
    gtin14,
    isbn13,
    payload,
    sensitive: payload.sensitive,
  };
}
