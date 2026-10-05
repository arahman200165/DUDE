import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActionButton, Button, Field, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';
import { PairingScanner } from '../../src/ui/pairing-scanner';
import { reviewMobilePairing } from '../../src/hub/enrollment';
import { useWorkbench } from '../../src/state/workbench-provider';
import { GuardedAction } from '../../src/ui/guarded-action';

export default function ConnectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contextId?: string }>();
  const [pairingString, setPairingString] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [review, setReview] = useState<ReturnType<typeof reviewMobilePairing>>();
  const [error, setError] = useState<string>();
  const { actions, snapshot } = useWorkbench();
  const contextId = typeof params.contextId === 'string' ? params.contextId : undefined;
  const rePair = !!contextId || snapshot.connection.kind !== 'standalone';
  const setPairing = (text: string) => { setPairingString(text); setReview(undefined); setError(undefined); };
  return <Screen>
    <Section title="Current connection"><ConnectionStatus />
      <Button title="Synchronization and category consent" onPress={() => router.push('/settings/sync')} />
      <Button title="Recovery and cached environments" onPress={() => router.push('/settings/recovery')} />
    </Section>
    <Section title={rePair ? 'Re-pair with a fresh native key' : 'Connect to your own Hub'}>
      <Label>Use the pairing string or QR code from your Hub’s Devices page.</Label>
      {rePair && <Label>Use the re-attach pairing code for this existing device, or a pairing code from a transferred Hub. This keeps the same device ID, cached data and pending edits, creates a fresh key, and requires category consent again.</Label>}
      <Field label="Device display name" value={displayName} onChangeText={text => { setDisplayName(text); setReview(undefined); }} placeholder="My Android phone" maxLength={64} />
      <Field label="Pairing string" value={pairingString} onChangeText={setPairing} placeholder="Paste pairing string" autoCapitalize="none" autoCorrect={false} multiline textAlignVertical="top" />
      <Button title="Scan pairing QR" onPress={() => setScanning(true)} />
      <Button title="Review connection" onPress={() => {
        try { setReview(reviewMobilePairing(pairingString, displayName)); setError(undefined); }
        catch { setReview(undefined); setError('Enter a valid pairing string and a device display name.'); }
      }} />
      {error && <Label accessibilityRole="alert">{error}</Label>}
      {review && <Section title="Review before connecting">
        <Label>Hub endpoint: {review.hubUrl}</Label>
        <Label>Device display name: {review.displayName}</Label>
        <Label mono>Certificate pin: {review.pin}</Label>
        <Label>Compare this pin with the Hub pairing screen. {rePair ? 'Re-pairing replaces the native credential after preserving a durable recovery copy.' : 'Connecting registers this Android device with your Hub.'}</Label>
        <Label>Enrollment shares this device’s ID, display name, public key, Android platform and secure-storage capability. Favorites and settings stay local until you approve category consent. Your own Hub can read the plaintext records you approve for synchronization.</Label>
        <Label muted>Scanning and opening a link only review or navigate; they never enroll a device, import recovery data or execute a tool. An older incompatible Hub must be upgraded before syncing.</Label>
        <ActionButton title={rePair ? 'Confirm and re-pair' : 'Confirm and connect'} disabled={!snapshot.capabilities.connect || !!snapshot.recovery?.pendingAttempt} onPress={async () => {
          const input = { pairingString, displayName: review.displayName, acknowledged: true as const };
          const result = await (rePair ? actions.rePair(input, contextId) : actions.connect(input));
          if (result.ok) { setPairingString(''); setReview(undefined); router.push('/settings/sync'); }
          return result;
        }} />
      </Section>}
      {snapshot.recovery?.pendingAttempt && <Label accessibilityRole="alert">A durable registration attempt needs recovery. Retry it or explicitly preview discarding it in Recovery before starting another pairing.</Label>}
      {!snapshot.capabilities.connect && <Label muted>Connecting is currently unavailable. Review the connection status and Recovery for the required next action.</Label>}
      <PairingScanner visible={scanning} onClose={() => setScanning(false)} onText={setPairing} />
    </Section>
    <GuardedAction title="Disconnect from Hub" confirmTitle="Confirm disconnect and erase this native key" disabled={!snapshot.capabilities.disconnect} explanation="Stop synchronization and unenroll this device when the Hub is reachable. Save a recovery copy, erase the native key, and keep this environment as a read-only archive. Offline disconnect may leave the Hub row active; ask its owner to revoke it." preview={() => actions.previewDisconnect()} confirm={token => actions.disconnect(token)} />
  </Screen>;
}
