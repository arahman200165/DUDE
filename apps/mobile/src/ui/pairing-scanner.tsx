import { useState } from 'react';
import { Modal, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { parsePairingString } from '@dude/contracts/hub';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label, Screen, Section } from './primitives';

/** Camera is mounted only after an explicit scan action and permission grant. Scanning fills review; it never connects. */
export function PairingScanner({ visible, onClose, onText }: { readonly visible: boolean; readonly onClose: () => void; readonly onText: (text: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { theme } = useWorkbench();
  const grant = async () => {
    setBusy(true); setError(undefined);
    try { await requestPermission(); } catch { setError('Camera permission could not be requested. You can paste the pairing string instead.'); }
    finally { setBusy(false); }
  };
  return <Modal visible={visible} onRequestClose={onClose} animationType={theme.reducedMotion ? 'none' : 'slide'}>
    <Screen><Section title="Scan Hub pairing QR">
      <Label>The scanned string fills the connection review. Confirm the endpoint, device name and pin before connecting.</Label>
      {permission?.granted && visible ? <View style={{ height: 320, borderColor: theme.colors.border, borderWidth: 1 }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
          if (!parsePairingString(data)) { setError('That QR code is not a DUDE Hub pairing string.'); return; }
          setError(undefined); onText(data.trim()); onClose();
        }} />
      </View> : <>
        <Label>Camera permission is needed to scan a QR code. Pasting a pairing string also works.</Label>
        {permission?.canAskAgain !== false
          ? <Button title={busy ? 'Requesting permission…' : 'Allow camera'} disabled={busy} onPress={() => { void grant(); }} />
          : <Button title="Open Android app permissions" onPress={() => { void Linking.openSettings().catch(() => setError('Open Android Settings to allow camera access.')); }} />}
      </>}
      {error && <Label accessibilityRole="alert">{error}</Label>}
      <Button title="Return to connection review" onPress={onClose} />
    </Section></Screen>
  </Modal>;
}
