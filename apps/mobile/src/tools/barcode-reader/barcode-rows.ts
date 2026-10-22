import type { BarcodeResult, BarcodeSymbology } from '@dude/tool-engine/tools/barcode-reader/barcode-result';
import type { KeyValueRow } from '../../kit';

/** Digits a GS1 check digit needs, by symbology (the engine returns no check result for any other length). */
const GS1_LENGTH: Partial<Record<BarcodeSymbology, number>> = { ean8: 8, ean13: 13, upca: 12, itf14: 14 };

/** Symbology and GS1 rows of an interpreted barcode. Payload classification rows come from `scanRows`. */
export function barcodeRows(result: BarcodeResult): KeyValueRow[] {
  const rows: KeyValueRow[] = [{ key: 'format', label: 'Format', value: `${result.label} (${result.twoDimensional ? '2D' : '1D'})` }];
  if (result.checkDigit) {
    const { valid, expected, actual } = result.checkDigit;
    rows.push({ key: 'check-digit', label: 'Check digit', value: valid ? `Valid (${actual})` : `Invalid (expected ${expected}, found ${actual})` });
  } else if (GS1_LENGTH[result.symbology] !== undefined) {
    rows.push({ key: 'check-digit', label: 'Check digit', value: `Not checked (needs ${GS1_LENGTH[result.symbology]} digits)` });
  }
  if (result.gtin14) rows.push({ key: 'gtin14', label: 'GTIN-14', value: result.gtin14 });
  if (result.isbn13) rows.push({ key: 'isbn13', label: 'ISBN-13', value: result.isbn13 });
  return rows;
}
