import { useMemo, useState } from 'react';
import { classifyScanPayload } from '@dude/tool-engine/tools/qr-code-scanner/scan-payload';
import type { BarcodeType } from 'expo-camera';
import { InputEditor, ToolScreen } from '../../kit';
import { ScanResultView } from './scan-result';
import { ScanSources, type ScanHit } from './scan-sources';

const QR_ONLY: BarcodeType[] = ['qr'];

/**
 * QR Code Scanner: camera, image or pasted text. The decoded text is classified by the shared engine and kept in component
 * state only (manifest persistence is `none`; sensitive payloads must never be stored).
 */
export default function QrCodeScannerScreen() {
  const [scanned, setScanned] = useState<ScanHit | null>(null);
  const [pasted, setPasted] = useState('');
  const text = scanned?.data ?? (pasted.trim() === '' ? null : pasted);
  const payload = useMemo(() => (text === null ? null : classifyScanPayload(text)), [text]);
  return <ToolScreen
    input={<>
      <ScanSources barcodeTypes={QR_ONLY} subject="QR code" onHit={hit => { setScanned(hit); setPasted(''); }} />
      <InputEditor label="Or paste the decoded text" placeholder="https://example.com or WIFI:T:WPA;S:Name;P:password;;" value={pasted} onChangeText={value => { setPasted(value); setScanned(null); }} />
    </>}
    output={payload === null ? undefined : <ScanResultView key={payload.raw} payload={payload} />}
  />;
}
