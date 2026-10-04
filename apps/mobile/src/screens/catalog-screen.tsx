import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CATEGORY_METADATA, TOOL_CATEGORIES, type ToolCategory } from '@dude/shared-types/shared/models/tool-category.model';
import { useWorkbench } from '../state/workbench-provider';
import { discoverTools } from '../registry/discovery';
import { Button, Field, Label } from '../ui/primitives';
import { ToolRow } from '../ui/tool-row';

export function CatalogScreen({ search = false }: { readonly search?: boolean }) {
  const { theme } = useWorkbench();
  const params = useLocalSearchParams<{ category?: string }>();
  const category = TOOL_CATEGORIES.find(category => category === params.category);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const tools = discoverTools(query, category);
  const select = (next?: ToolCategory) => router.setParams({ category: next ?? '' });
  return <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
    <View style={{ padding: theme.metrics.spacePanel, gap: theme.metrics.spaceNormal }}>
      <Field label={search ? 'Search tools' : 'Filter tools'} value={query} onChangeText={setQuery} autoFocus={search} autoCorrect={false} autoCapitalize="none" placeholder="Title, ID, keyword or category" returnKeyType="search" />
      <ScrollView horizontal contentContainerStyle={{ gap: theme.metrics.spaceNormal }} showsHorizontalScrollIndicator={false}>
        <Button title="All categories" selected={!category} onPress={() => select()} />
        {TOOL_CATEGORIES.map(item => <Button key={item} title={CATEGORY_METADATA[item].label} selected={category === item} onPress={() => select(item)} />)}
      </ScrollView>
      <Label muted accessibilityLiveRegion="polite">{tools.length} tools · registry discovery</Label>
    </View>
    <FlatList data={tools} keyExtractor={tool => tool.id} renderItem={({ item }) => <ToolRow tool={item} />} contentContainerStyle={{ paddingHorizontal: theme.metrics.spacePanel, paddingBottom: theme.metrics.spacePanel }} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Label muted>No matching tools. Try another search or category.</Label>} />
  </View>;
}
