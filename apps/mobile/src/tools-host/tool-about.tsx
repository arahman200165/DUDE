import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import type { MobileAvailability } from '../registry/mobile-binding';
import { useWorkbench } from '../state/workbench-provider';
import { Label } from '../ui/primitives';

/** Collapsible "Android availability" and metadata details; expanded by default only when the tool cannot run here. */
export function ToolAbout({ tool, availability }: { readonly tool: ToolMetadata; readonly availability: MobileAvailability }) {
  const { theme } = useWorkbench();
  const [open, setOpen] = useState(!availability.available);
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Pressable accessibilityRole="button" accessibilityLabel="About this tool" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={{ minHeight: theme.metrics.touchMin, justifyContent: 'center', borderTopWidth: 1, borderTopColor: theme.colors.border }}>
      <Label style={{ fontWeight: '700' }}>{open ? '▾' : '▸'} About</Label>
    </Pressable>
    {open && <>
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Android availability</Label>
        <Label style={{ color: theme.status.info }}>ⓘ {availability.available ? 'Runs natively on this device.' : availability.reason}</Label>
        {!availability.available && <Label muted>Open it on desktop or the web companion. Pinning it here still syncs with your other devices.</Label>}
      </View>
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Tool metadata</Label>
        <Label mono>ID: {tool.id}</Label>
        <Label>Status: {tool.status ?? 'stable'}</Label>
        <Label>Network: {tool.network?.required ? 'Required' : 'Not required by the registry'}</Label>
        {tool.network?.detail && <Label muted>{tool.network.detail}</Label>}
        {!!tool.consequenceClass?.length && <Label>Consequences: {tool.consequenceClass.join(', ')}</Label>}
        <Label muted>Keywords: {tool.keywords.join(', ')}</Label>
        {tool.capabilities?.map((capability, index) => <Label key={index} muted>{capability.kind === 'platform' ? capability.note : `Optional runtime: ${capability.runtime}`}</Label>)}
      </View>
    </>}
  </View>;
}
