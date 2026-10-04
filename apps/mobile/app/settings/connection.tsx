import { useState } from 'react';
import { Button, Field, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';

/** Native enrollment owner replaces the disabled review stage with authenticated transport. */
export default function ConnectionScreen() {
  const [pairingString, setPairingString] = useState('');
  const [displayName, setDisplayName] = useState('');
  return <Screen>
    <Section title="Current connection"><ConnectionStatus /></Section>
    <Section title="Connect to your own Hub">
      <Label>Use the pairing string or QR code from your Hub’s Devices page.</Label>
      <Field label="Device display name" value={displayName} onChangeText={setDisplayName} placeholder="My Android phone" maxLength={80} />
      <Field label="Pairing string" value={pairingString} onChangeText={setPairingString} placeholder="Paste pairing string" autoCapitalize="none" autoCorrect={false} multiline textAlignVertical="top" />
      <Button title="Scan pairing QR" disabled onPress={() => undefined} />
      <Button title="Review connection" disabled onPress={() => undefined} />
      <Label muted>Native connection is not implemented yet. Pasting a string does not enroll this device.</Label>
    </Section>
  </Screen>;
}
