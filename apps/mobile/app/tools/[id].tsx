import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { CATEGORY_METADATA } from '@dude/shared-types/shared/models/tool-category.model';
import { favoriteItemId } from '@dude/persistence/codecs/favorite.codec';
import { useWorkbench } from '../../src/state/workbench-provider';
import { newToolFavorite } from '../../src/state/workbench-model';
import { TOOL_BY_ID } from '../../src/registry/discovery';
import { mobileAvailability } from '../../src/registry/mobile-binding';
import { MOBILE_BINDINGS } from '../../src/registry/mobile-bindings.generated';
import { ToolAbout } from '../../src/tools-host/tool-about';
import { ToolRunner } from '../../src/tools-host/tool-runner';
import { ToolSettingsAction } from '../../src/tools-host/tool-settings-modal';
import { ActionButton, Label, Screen, Section } from '../../src/ui/primitives';

export default function ToolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tool = TOOL_BY_ID.get(id);
  if (!tool) return <Screen><Section title="Unknown tool"><Label>This tool is absent from this client’s registry.</Label><Label mono>{id}</Label></Section></Screen>;
  return <ToolScreen tool={tool} />;
}

function ToolScreen({ tool }: { readonly tool: ToolMetadata }) {
  const { snapshot, actions, theme } = useWorkbench();
  const availability = mobileAvailability(tool, MOBILE_BINDINGS);
  const favorite = snapshot.favorites.find(item => item.id === favoriteItemId('tool', tool.id));
  return <Screen>
    <View style={{ gap: theme.metrics.spaceNormal }}>
      <Label accessibilityRole="header" style={{ fontSize: theme.metrics.textUi + theme.metrics.spaceNormal, fontWeight: '700' }}>{tool.title}</Label>
      <Label style={{ color: theme.categories[tool.category].color }}>▦ {CATEGORY_METADATA[tool.category].label}</Label>
      <Label>{tool.description}</Label>
      <ActionButton title={favorite ? 'Unpin tool' : 'Pin tool'} disabled={!snapshot.capabilities.favorites} onPress={() => actions.setFavorite(favorite ?? newToolFavorite(snapshot.favorites, tool.id), !favorite)} />
      {availability.available && availability.binding.settingsLoad && <ToolSettingsAction toolTitle={tool.title} settingsLoad={availability.binding.settingsLoad} />}
    </View>
    {availability.available && <ToolRunner toolId={tool.id} toolTitle={tool.title} binding={availability.binding} />}
    <ToolAbout tool={tool} availability={availability} />
  </Screen>;
}
