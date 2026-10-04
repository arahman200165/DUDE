import { View } from 'react-native';
import type { FavoriteItem } from '@dude/persistence/codecs/favorite.codec';
import { useWorkbench } from '../state/workbench-provider';
import { TOOL_BY_ID } from '../registry/discovery';
import { ActionButton, Label } from './primitives';
import { ToolRow } from './tool-row';

export function FavoriteList({ items }: { readonly items: readonly FavoriteItem[] }) {
  const { actions, snapshot, theme } = useWorkbench();
  if (!items.length) return <Label muted>No favorites yet. Pin a tool from its details.</Label>;
  return <View style={{ gap: theme.metrics.spaceNormal }}>{items.map(item => {
    const tool = item.kind === 'tool' ? TOOL_BY_ID.get(item.targetId) : undefined;
    return <View key={item.id} style={{ gap: theme.metrics.spaceMicro }}>
      {tool ? <ToolRow tool={tool} /> : <View style={{ paddingVertical: theme.metrics.spaceNormal }}>
        <Label>{item.kind === 'pipeline' ? 'Pipeline' : 'Unknown tool'}: {item.targetId}</Label>
        <Label muted>{item.kind === 'pipeline' ? 'Pipeline execution is unavailable on Android.' : 'This tool is absent from this client’s registry.'}</Label>
      </View>}
      <ActionButton title={`Unpin ${tool?.title ?? item.targetId}`} disabled={!snapshot.capabilities.favorites} onPress={() => actions.setFavorite(item, false)} />
    </View>;
  })}</View>;
}
