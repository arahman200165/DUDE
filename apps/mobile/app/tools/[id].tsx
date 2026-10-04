import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { CATEGORY_METADATA } from '@dude/shared-types/shared/models/tool-category.model';
import { favoriteItemId } from '@dude/persistence/codecs/favorite.codec';
import { useWorkbench } from '../../src/state/workbench-provider';
import { newToolFavorite } from '../../src/state/workbench-model';
import { TOOL_BY_ID } from '../../src/registry/discovery';
import { mobileAvailability } from '../../src/registry/mobile-binding';
import { MOBILE_BINDINGS } from '../../src/registry/mobile-bindings.generated';
import { ActionButton, Label, Screen, Section } from '../../src/ui/primitives';

export default function ToolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snapshot, actions, theme } = useWorkbench();
  const tool = TOOL_BY_ID.get(id);
  if (!tool) return <Screen><Section title="Unknown tool"><Label>This tool is absent from this client’s registry.</Label><Label mono>{id}</Label></Section></Screen>;
  const availability = mobileAvailability(tool, MOBILE_BINDINGS);
  const favorite = snapshot.favorites.find(item => item.id === favoriteItemId('tool', tool.id));
  return <Screen>
    <View style={{ gap: theme.metrics.spaceNormal }}>
      <Label accessibilityRole="header" style={{ fontSize: theme.metrics.textUi + theme.metrics.spaceNormal, fontWeight: '700' }}>{tool.title}</Label>
      <Label style={{ color: theme.categories[tool.category].color }}>▦ {CATEGORY_METADATA[tool.category].label}</Label>
      <Label>{tool.description}</Label>
      <ActionButton title={favorite ? 'Unpin tool' : 'Pin tool'} disabled={!snapshot.capabilities.favorites} onPress={() => actions.setFavorite(favorite ?? newToolFavorite(snapshot.favorites, tool.id), !favorite)} />
    </View>
    <Section title="Android availability">
      <Label style={{ color: theme.status.info }}>ⓘ {availability.available ? 'Mobile UI is registered.' : availability.reason}</Label>
      <Label muted>Phase 31H provides discovery and synchronization. Tool execution starts in Phase 31I.</Label>
    </Section>
    <Section title="Tool metadata">
      <Label mono>ID: {tool.id}</Label>
      <Label>Status: {tool.status ?? 'stable'}</Label>
      <Label>Network: {tool.network?.required ? 'Required' : 'Not required by the registry'}</Label>
      {tool.network?.detail && <Label muted>{tool.network.detail}</Label>}
      {!!tool.consequenceClass?.length && <Label>Consequences: {tool.consequenceClass.join(', ')}</Label>}
      <Label muted>Keywords: {tool.keywords.join(', ')}</Label>
      {tool.capabilities?.map((capability, index) => <Label key={index} muted>{capability.kind === 'platform' ? capability.note : `Optional runtime: ${capability.runtime}`}</Label>)}
    </Section>
  </Screen>;
}
