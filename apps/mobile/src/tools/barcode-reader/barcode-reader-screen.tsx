import { useMemo, useState } from 'react';
import { interpretBarcode } from '@dude/tool-engine/tools/barcode-reader/barcode-result';
import type { BarcodeType } from 'expo-camera';
import { InputEditor, ModeSegment, ToolScreen } from '../../kit';
import { ScanResultView } from '../qr-code-scanner/scan-result';
import { ScanSources, type ScanHit } from '../qr-code-scanner/scan-sources';
import { barcodeRows } from './barcode-rows';

/** Every symbology expo-camera can scan on Android (SDK 57). */
const ALL_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'code128', 'itf14', 'codabar', 'datamatrix', 'pdf417', 'aztec', 'qr'];
const FORMATS: readonly { readonly id: BarcodeType; readonly label: string }[] = [
  { id: 'ean13', label: 'EAN-13' }, { id: 'ean8', label: 'EAN-8' }, { id: 'upc_a', label: 'UPC-A' }, { id: 'upc_e', label: 'UPC-E' },
  { id: 'code39', label: 'Code 39' }, { id: 'code93', label: 'Code 93' }, { id: 'code128', label: 'Code 128' }, { id: 'itf14', label: 'ITF-14' },
  { id: 'codabar', label: 'Codabar' }, { id: 'datamatrix', label: 'Data Matrix' }, { id: 'pdf417', label: 'PDF417' }, { id: 'aztec', label: 'Aztec' }, { id: 'qr', label: 'QR Code' },
];

/**
 * Barcode Reader: camera, image or pasted text with a symbology selector (a pasted value has no format of its own, so the
 * user states it; default EAN-13). Results stay in component state only, like the QR Code Scanner.
 */
export default function BarcodeReaderScreen() {
  const [scanned, setScanned] = useState<ScanHit | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteFormat, setPasteFormat] = useState<string>('ean13');
  const hit = useMemo<ScanHit | null>(() => scanned ?? (pasted.trim() === '' ? null : { data: pasted.trim(), type: pasteFormat }), [scanned, pasted, pasteFormat]);
  const result = useMemo(() => (hit === null ? null : interpretBarcode(hit.data, hit.type)), [hit]);
  return <ToolScreen
    input={<>
      <ScanSources barcodeTypes={ALL_TYPES} subject="barcode" onHit={next => { setScanned(next); setPasted(''); }} />
      <ModeSegment label="Format of the pasted value" modes={FORMATS} value={pasteFormat} onChange={setPasteFormat} />
      <InputEditor label="Or paste the decoded value" placeholder="4006381333931" value={pasted} onChangeText={value => { setPasted(value); setScanned(null); }} />
    </>}
    output={result === null ? undefined : <ScanResultView key={`${result.symbology}:${result.text}`} payload={result.payload} leadingRows={barcodeRows(result)} showClassification={result.payload.kind !== 'text'} />}
  />;
}
