import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useWorkbench } from '../../src/state/workbench-provider';

export default function TabLayout() {
  const { theme } = useWorkbench();
  const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text allowFontScaling={false} accessible={false} style={{ color, fontSize: theme.metrics.textUi + theme.metrics.spaceNormal }}>{glyph}</Text>;
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: theme.colors.panel }, headerTintColor: theme.colors.text, headerTitleStyle: { fontSize: theme.metrics.textUi },
    tabBarStyle: { backgroundColor: theme.colors.panel, borderTopColor: theme.colors.border, minHeight: theme.metrics.touchMin },
    tabBarActiveTintColor: theme.colors.accent, tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarLabelStyle: { fontSize: theme.metrics.textUiXs }, tabBarAllowFontScaling: true,
    sceneStyle: { backgroundColor: theme.colors.bg }, animation: theme.reducedMotion ? 'none' : 'shift',
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'DUDE Preview', tabBarIcon: icon('⌂') }} />
    <Tabs.Screen name="tools" options={{ title: 'Tools', tabBarIcon: icon('☷') }} />
    <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('⌕') }} />
    <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarIcon: icon('★') }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
  </Tabs>;
}
