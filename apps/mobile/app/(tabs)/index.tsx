import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { TOOL_METADATA } from '@dude/tool-registry';
import { CATEGORY_METADATA, TOOL_CATEGORIES } from '@dude/shared-types/shared/models/tool-category.model';
import { useWorkbench } from '../../src/state/workbench-provider';
import { Button, Label, Screen, Section } from '../../src/ui/primitives';
import { FavoriteList } from '../../src/ui/favorite-list';
import { ConnectionStatus } from '../../src/ui/connection-status';

export default function HomeScreen() {
  const router = useRouter();
  const { snapshot, theme } = useWorkbench();
  const favorites = [...snapshot.favorites].sort((a, b) => a.order - b.order).slice(0, 6);
  return <Screen>
    <Section title="This workbench"><ConnectionStatus /><Button title="Connect to your Hub" onPress={() => router.push('/settings/connection')} /></Section>
    <Section title="Favorites"><FavoriteList items={favorites} /><Button title="All favorites" onPress={() => router.navigate('/(tabs)/favorites')} /></Section>
    <Section title="Browse by category"><View>{TOOL_CATEGORIES.map(category => {
      const count = TOOL_METADATA.filter(tool => tool.category === category).length;
      return <Pressable key={category} accessibilityRole="button" accessibilityLabel={`${CATEGORY_METADATA[category].label}, ${count} tools`} onPress={() => router.navigate({ pathname: '/(tabs)/tools', params: { category } })} style={({ pressed }) => ({ minHeight: theme.metrics.touchMin, justifyContent: 'center', paddingVertical: theme.metrics.spaceNormal, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: pressed ? theme.colors.panelElevated : theme.colors.bg })}>
        <Label style={{ color: theme.categories[category].color }}>▦ {CATEGORY_METADATA[category].label} · {count}</Label>
      </Pressable>;
    })}</View></Section>
    <Label muted>Discover the full registry. Native tool execution arrives in Phase 31I.</Label>
  </Screen>;
}
