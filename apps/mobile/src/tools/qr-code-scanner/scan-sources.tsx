import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as Linking from 'expo-linking';
import { announce, hapticError, hapticSuccess, pickImage } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';

export interface ScanHit { readonly data: string; readonly type: string }

/**
 * The two scanning inputs shared by the QR Code Scanner and the Barcode Reader (paste is the screen's own text field).
 * - Camera: permission is requested only when the user taps "Scan with camera", the CameraView mounts only after a grant
 *   and unmounts after the first result (single shot), on Cancel, and when the app leaves the foreground. A denial shows a
 *   message and leaves the other inputs working. Nothing opens the camera by itself.
 * - Image: the Android Photo Picker (no media permission) then expo-camera's `scanFromURLAsync`.
 */
export function ScanSources({ barcodeTypes, subject, onHit }: { readonly barcodeTypes: BarcodeType[]; readonly subject: string; readonly onHit: (hit: ScanHit) => void }) {
  const { theme } = useWorkbench();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);
  const settings = useMemo(() => ({ barcodeTypes }), [barcodeTypes]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') setCameraOpen(false); });
    return () => subscription.remove();
  }, []);

  const startCamera = async () => {
    setMessage(null);
    let granted = permission?.granted === true;
    if (!granted) {
      try { granted = (await requestPermission()).granted; } catch { granted = false; }
    }
    if (!granted) { setDenied(true); void hapticError(); announce('Camera permission denied'); return; }
    setDenied(false);
    handled.current = false;
    setCameraOpen(true);
  };

  const scanImage = async () => {
    setMessage(null); setBusy(true);
    try {
      const image = await pickImage();
      if (!image) return;
      const results = await scanFromURLAsync(image.uri, barcodeTypes);
      const first = results[0];
      if (!first) { setMessage(`No ${subject} was found in that image. Try a sharper image where the code fills most of the frame.`); void hapticError(); return; }
      void hapticSuccess(); announce('Code scanned');
      onHit({ data: first.data, type: first.type });
    } catch {
      setMessage('That image could not be scanned. Try another image or paste the text instead.'); void hapticError();
    } finally { setBusy(false); }
  };

  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Scan</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      {cameraOpen
        ? <Button testID="scan-camera-stop" title="Cancel scan" onPress={() => setCameraOpen(false)} />
        : <Button testID="scan-camera" title="Scan with camera" hint={`Asks for camera access, then scans one ${subject}`} onPress={() => { void startCamera(); }} />}
      <Button testID="scan-image" title={busy ? 'Scanning image…' : 'Scan image'} disabled={busy} hint={`Picks an image with the Android photo picker and looks for a ${subject}`} onPress={() => { void scanImage(); }} />
    </View>
    {cameraOpen && <View testID="scan-camera-preview" accessible accessibilityLabel={`Camera preview. Point the camera at a ${subject}.`} style={{ height: 320, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius, overflow: 'hidden' }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={settings} onMountError={() => { setCameraOpen(false); setMessage('The camera could not start. You can scan an image or paste the text instead.'); }}
        onBarcodeScanned={({ data, type }) => {
          if (handled.current) return;
          handled.current = true;
          setCameraOpen(false);
          void hapticSuccess(); announce('Code scanned');
          onHit({ data, type });
        }} />
    </View>}
    {denied && <View testID="scan-permission-denied" accessibilityRole="alert" style={{ gap: theme.metrics.spaceNormal }}>
      <Label style={{ color: theme.status.warning }}>! Camera permission was denied. You can still scan an image or paste the text below.</Label>
      {permission?.canAskAgain === false && <Button testID="scan-open-settings" title="Open Android app permissions" onPress={() => { void Linking.openSettings().catch(() => setMessage('Open Android Settings to allow camera access.')); }} />}
    </View>}
    {message && <Label testID="scan-message" accessibilityRole="alert" style={{ color: theme.status.error }}>! {message}</Label>}
  </View>;
}
