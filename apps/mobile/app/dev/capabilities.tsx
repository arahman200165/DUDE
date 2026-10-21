import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { runCapabilityProbe, type ProbeEntry } from '../../src/engine-host/capability-probe';
import { Label, Screen, Section } from '../../src/ui/primitives';

/** Debug-only Hermes capability probe; never linked from a tab and inert in release builds. */
function CapabilityProbe() {
  const [report, setReport] = useState<readonly ProbeEntry[]>();
  useEffect(() => { void runCapabilityProbe().then(setReport); }, []);
  return <Screen>
    <Section title="Hermes capability probe">
      {!report && <Label muted testID="probe-pending">Running probe…</Label>}
      {report?.map(entry => <View key={entry.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{entry.name}</Label><Label testID={`probe-${entry.name}`} accessibilityLabel={`${entry.name}: ${entry.ok ? 'ok' : 'missing'}`} mono>{entry.ok ? 'ok' : 'missing'}</Label></View>)}
    </Section>
    {report?.filter(entry => !entry.ok).map(entry => <Label key={entry.name} muted>{entry.name}: {entry.detail ?? 'missing'}</Label>)}
  </Screen>;
}

export default function CapabilitiesScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <CapabilityProbe />;
}
