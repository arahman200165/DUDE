import { useRouter } from 'expo-router';
import { Button, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';

export default function SettingsScreen() {
  const router = useRouter();
  return <Screen>
    <Section title="Workbench"><Button title="Appearance" onPress={() => router.push('/settings/appearance')} /><Button title="Environment & Hub" onPress={() => router.push('/settings/connection')} /><Button title="Synchronization and category consent" onPress={() => router.push('/settings/sync')} /><Button title="Recovery and cached environments" onPress={() => router.push('/settings/recovery')} /></Section>
    <Section title="Connection and synchronization"><ConnectionStatus /></Section>
    <Label muted>Desktop-only settings remain on their owning device.</Label>
  </Screen>;
}
