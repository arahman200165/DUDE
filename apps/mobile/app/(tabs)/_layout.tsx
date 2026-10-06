import { Tabs } from 'expo-router';
import { Text, useWindowDimensions, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkbench } from '../../src/state/workbench-provider';

export default function TabLayout() {
  const { theme } = useWorkbench();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const iconSize = theme.metrics.textUi + theme.metrics.spaceNormal;
  const labelLineHeight = theme.metrics.textUiXs + theme.metrics.spaceMicro;
  // The navigator's fixed default height clips scaled labels. Reserve two lines
  // for narrow screens and keep the entire touch target above system navigation.
  const tabHeight = Math.max(theme.metrics.touchMin, Math.ceil(iconSize + labelLineHeight * fontScale * 2 + theme.metrics.spaceNormal * 2));
  const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text allowFontScaling={false} accessible={false} style={{ color, fontSize: iconSize }}>{glyph}</Text>;
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: theme.colors.panel }, headerTintColor: theme.colors.text, headerTitleStyle: { fontSize: theme.metrics.textUi },
    tabBarStyle: { backgroundColor: theme.colors.panel, borderTopColor: theme.colors.border, height: tabHeight + insets.bottom, paddingTop: theme.metrics.spaceMicro },
    tabBarActiveTintColor: theme.colors.accent, tabBarInactiveTintColor: theme.colors.textMuted,
    tabBarLabelPosition: 'below-icon', tabBarAllowFontScaling: true,
    tabBarLabel: ({ color, children }) => <Text numberOfLines={2} style={{ color, textAlign: 'center', fontSize: theme.metrics.textUiXs, lineHeight: labelLineHeight }}>{children}</Text>,
    sceneStyle: { backgroundColor: theme.colors.bg }, animation: theme.reducedMotion ? 'none' : 'shift',
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'DUDE Preview', tabBarIcon: icon('⌂') }} />
    <Tabs.Screen name="tools" options={{ title: 'Tools', tabBarIcon: icon('☷') }} />
    <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('⌕') }} />
    <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarIcon: icon('★') }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙') }} />
  </Tabs>;
}
