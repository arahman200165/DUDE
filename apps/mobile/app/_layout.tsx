import '../src/engine-host/polyfills';
import { installMobileEngineHost } from '../src/engine-host/mobile-engine-host';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View, useColorScheme } from 'react-native';
import { resolveNativeTheme } from '@dude/domain/core/appearance/native-theme';
import { DEFAULT_APPEARANCE } from '@dude/domain/core/appearance/appearance.model';
import { openProductionWorkbench } from '../src/state/boot';
import type { DurableWorkbench } from '../src/state/durable-backend';
import { WorkbenchProvider, useWorkbench } from '../src/state/workbench-provider';
import { useBackgroundWipe } from '../src/tools-host/use-background-wipe';
import { useKeyboardBack } from '../src/tools-host/use-keyboard-back';
import { useIncomingShare } from '../src/share/use-incoming-share';

installMobileEngineHost();

export const unstable_settings = { initialRouteName: '(tabs)' };

function WorkbenchNavigator() {
  const { theme } = useWorkbench();
  useIncomingShare();
  // One shell-level handler covers every screen and tab: the first Back with a keyboard up only dismisses it.
  useKeyboardBack();
  return <>
    <StatusBar style={theme.effective['theme'] === 'light' ? 'dark' : 'light'} />
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.colors.panel }, headerTintColor: theme.colors.text, headerTitleStyle: { fontSize: theme.metrics.textUi }, contentStyle: { backgroundColor: theme.colors.bg }, animation: theme.reducedMotion ? 'none' : 'default' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tools/[id]" options={{ title: 'Tool details' }} />
      <Stack.Screen name="share" options={{ title: 'Share to DUDE' }} />
      <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="settings/connection" options={{ title: 'Environment & Hub' }} />
      <Stack.Screen name="settings/sync" options={{ title: 'Synchronization' }} />
      <Stack.Screen name="settings/recovery" options={{ title: 'Recovery' }} />
    </Stack>
  </>;
}

export default function RootLayout() {
  useBackgroundWipe();
  const [backend, setBackend] = useState<DurableWorkbench | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const scheme = useColorScheme();
  const theme = resolveNativeTheme(DEFAULT_APPEARANCE, { prefersLight: scheme === 'light', prefersMoreContrast: false, prefersReducedMotion: false });
  useEffect(() => {
    let active = true;
    let opened: DurableWorkbench | null = null;
    let subscription: ReturnType<typeof AppState.addEventListener> | null = null;
    setError(undefined);
    void openProductionWorkbench().then(async value => {
      opened = value;
      if (!active) { await value.close(); return; }
      setBackend(value);
      subscription = AppState.addEventListener('change', state => { void value.setForeground(state === 'active'); });
      await value.setForeground(AppState.currentState === 'active');
    }).catch(issue => { if (active) setError(issue instanceof Error ? issue.message : 'Private device storage could not be opened.'); });
    return () => { active = false; subscription?.remove(); if (opened) void opened.close(); };
  }, [attempt]);
  if (!backend) return <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.metrics.spacePanel, justifyContent: 'center', gap: theme.metrics.spaceNormal }}>
    <StatusBar style={theme.effective['theme'] === 'light' ? 'dark' : 'light'} />
    <Text style={{ color: theme.colors.text, fontSize: theme.metrics.textUi }}>{error ? 'Private device storage is unavailable.' : 'Opening private device storage…'}</Text>
    {error && <>
      <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>{error} App data and signing keys have been preserved. Retry opening storage.</Text>
      <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ minHeight: theme.metrics.touchMin, justifyContent: 'center' }}><Text style={{ color: theme.colors.accent }}>Retry</Text></Pressable>
    </>}
  </View>;
  return <WorkbenchProvider backend={backend}><WorkbenchNavigator /></WorkbenchProvider>;
}
