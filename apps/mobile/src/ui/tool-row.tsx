import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { CATEGORY_METADATA } from '@dude/shared-types/shared/models/tool-category.model';
import { useWorkbench } from '../state/workbench-provider';
import { mobileAvailability } from '../registry/mobile-binding';
import { MOBILE_BINDINGS } from '../registry/mobile-bindings.generated';
import { Label } from './primitives';

/** `onPress` replaces opening the tool details, e.g. Share-to-DUDE hands the shared content to the chosen tool. */
export function ToolRow({ tool, showReason, onPress }: { readonly tool: ToolMetadata; readonly showReason?: boolean; readonly onPress?: (tool: ToolMetadata) => void }) {
  const { theme } = useWorkbench();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const availability = mobileAvailability(tool, MOBILE_BINDINGS);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${tool.title}, ${CATEGORY_METADATA[tool.category].label}, ${availability.available ? 'mobile UI available' : 'mobile UI unavailable'}`} accessibilityHint="Open tool details" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => onPress ? onPress(tool) : router.push(`/tools/${tool.id}`)} style={({ pressed }) => ({
    minHeight: theme.metrics.rowHeight, paddingVertical: theme.metrics.spacePanel, paddingHorizontal: theme.metrics.spaceNormal,
    borderBottomWidth: focused ? theme.metrics.focusWidth : 1, borderBottomColor: focused ? theme.colors.accent : theme.colors.border, borderLeftWidth: theme.metrics.focusWidth, borderLeftColor: theme.categories[tool.category].color,
    backgroundColor: pressed ? theme.colors.panelElevated : theme.colors.bg,
  })}>
    <View style={{ gap: theme.metrics.spaceMicro }}>
      <Label style={{ fontWeight: '600' }}>{tool.title}</Label>
      <Label muted>{tool.description}</Label>
      <Label style={{ color: theme.categories[tool.category].color, fontSize: theme.metrics.textUiSm }}>{CATEGORY_METADATA[tool.category].label} · {availability.available ? 'Mobile UI available' : 'Mobile UI unavailable'}</Label>
      {showReason && !availability.available && <Label muted style={{ fontSize: theme.metrics.textUiSm }}>{availability.reason}</Label>}
    </View>
  </Pressable>;
}
