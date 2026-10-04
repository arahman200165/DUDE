import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WorkbenchProvider, useWorkbench } from '../src/state/workbench-provider';

export const unstable_settings = { initialRouteName: '(tabs)' };

function WorkbenchNavigator() {
  const { theme } = useWorkbench();
  return <>
    <StatusBar style={theme.effective['theme'] === 'light' ? 'dark' : 'light'} />
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.colors.panel }, headerTintColor: theme.colors.text, headerTitleStyle: { fontSize: theme.metrics.textUi }, contentStyle: { backgroundColor: theme.colors.bg }, animation: theme.reducedMotion ? 'none' : 'default' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tools/[id]" options={{ title: 'Tool details' }} />
      <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
      <Stack.Screen name="settings/connection" options={{ title: 'Environment & Hub' }} />
    </Stack>
  </>;
}

export default function RootLayout() {
  return <WorkbenchProvider><WorkbenchNavigator /></WorkbenchProvider>;
}
