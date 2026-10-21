import { Suspense, lazy, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MobileToolBinding } from '../registry/mobile-binding';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label } from '../ui/primitives';
import { ToolErrorBoundary } from './tool-error-boundary';

/** "Tool settings" action plus the lazily loaded settings screen in an RN Modal (no sheet library). */
export function ToolSettingsAction({ toolTitle, settingsLoad }: { readonly toolTitle: string; readonly settingsLoad: NonNullable<MobileToolBinding['settingsLoad']> }) {
  const { theme } = useWorkbench();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const Settings = useMemo(() => lazy(settingsLoad), [settingsLoad, attempt]);
  return <>
    <Button title="Tool settings" hint="Opens this tool's settings" onPress={() => setOpen(true)} />
    <Modal visible={open} animationType={theme.reducedMotion ? 'none' : 'slide'} transparent={false} onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.metrics.spacePanel, gap: theme.metrics.spaceNormal, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
          <Label accessibilityRole="header" style={{ flex: 1, fontWeight: '700' }}>{toolTitle} settings</Label>
          <Button title="Close" onPress={() => setOpen(false)} />
        </View>
        <ScrollView contentContainerStyle={{ padding: theme.metrics.spacePanel, paddingBottom: theme.metrics.spacePanel + insets.bottom }} keyboardShouldPersistTaps="handled">
          <ToolErrorBoundary toolTitle={`${toolTitle} settings`} onReload={() => setAttempt(value => value + 1)}>
            <Suspense fallback={<ActivityIndicator accessibilityLabel="Loading settings" color={theme.colors.accent} />}><Settings /></Suspense>
          </ToolErrorBoundary>
        </ScrollView>
      </View>
    </Modal>
  </>;
}
