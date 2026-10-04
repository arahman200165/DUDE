import { useState } from 'react';
import { ActionButton, Button, Field, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';
import { PairingScanner } from '../../src/ui/pairing-scanner';
import { reviewMobilePairing } from '../../src/hub/enrollment';
import { useWorkbench } from '../../src/state/workbench-provider';

/** Native enrollment owner replaces the disabled review stage with authenticated transport. */
export default function ConnectionScreen() {
  const [pairingString, setPairingString] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [review, setReview] = useState<ReturnType<typeof reviewMobilePairing>>();
  const [error, setError] = useState<string>();
  const { actions, snapshot } = useWorkbench();
  const setPairing = (text: string) => { setPairingString(text); setReview(undefined); setError(undefined); };
  return <Screen>
    <Section title="Current connection"><ConnectionStatus /></Section>
    <Section title="Connect to your own Hub">
      <Label>Use the pairing string or QR code from your Hub’s Devices page.</Label>
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
        <Label>Compare this pin with the Hub pairing screen. Connecting registers this Android device with your Hub.</Label>
        <ActionButton title="Confirm and connect" disabled={!snapshot.capabilities.connect} onPress={() => actions.connect({ pairingString, displayName: review.displayName, acknowledged: true })} />
      </Section>}
      {!snapshot.capabilities.connect && <Label muted>Durable connection is not available in this build yet. Scan or paste a string to review it.</Label>}
      <PairingScanner visible={scanning} onClose={() => setScanning(false)} onText={setPairing} />
    </Section>
  </Screen>;
}
