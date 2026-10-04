import { View } from 'react-native';
import { useWorkbench } from '../state/workbench-provider';
import { Label } from './primitives';

export function ConnectionStatus() {
  const { snapshot, theme } = useWorkbench();
  const healthy = snapshot.connection.kind === 'connected';
  const standalone = snapshot.connection.kind === 'standalone';
  return <View style={{ gap: theme.metrics.spaceMicro }}>
    <Label style={{ color: healthy ? theme.status.success : standalone ? theme.status.offline : theme.status.warning, fontWeight: '600' }}>
      {healthy ? '✓' : standalone ? '○' : '!'} {standalone ? 'Standalone' : snapshot.connection.kind.replaceAll('-', ' ')}
    </Label>
    {snapshot.connection.environmentName && <Label>Environment: {snapshot.connection.environmentName}</Label>}
    {snapshot.connection.deviceName && <Label>Device: {snapshot.connection.deviceName}</Label>}
    <Label muted>{snapshot.connection.detail}</Label>
    <Label>{snapshot.sync.phase.replaceAll('-', ' ')} · {snapshot.sync.pending} pending · {snapshot.sync.conflicts} conflicts</Label>
    <Label muted>{snapshot.sync.detail}</Label>
    {snapshot.durability === 'memory' && <Label muted>Favorites and appearance changes last for this session.</Label>}
  </View>;
}
