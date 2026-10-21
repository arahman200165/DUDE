import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { MobileToolBinding } from '../registry/mobile-binding';
import { useWorkbench } from '../state/workbench-provider';
import { Label } from '../ui/primitives';
import { ToolErrorBoundary } from './tool-error-boundary';
import { useRecents } from './use-recents';

/** Lazily loads the tool screen inside a per-tool error boundary and records it as a recent when it mounts. */
export function ToolRunner({ toolId, toolTitle, binding }: { readonly toolId: string; readonly toolTitle: string; readonly binding: MobileToolBinding }) {
  const { theme } = useWorkbench();
  const { record } = useRecents();
  const [attempt, setAttempt] = useState(0);
  // A rejected dynamic import is cached by React.lazy, so Reload builds a new lazy component.
  const Tool = useMemo(() => lazy(binding.load), [binding, attempt]);
  useEffect(() => { record(toolId); }, [record, toolId]);
  return <ToolErrorBoundary toolTitle={toolTitle} onReload={() => setAttempt(value => value + 1)}>
    <Suspense fallback={<View accessible accessibilityRole="progressbar" accessibilityLabel={`Loading ${toolTitle}`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal, minHeight: theme.metrics.touchMin }}>
      <ActivityIndicator color={theme.colors.accent} />
      <Label muted>Loading {toolTitle}…</Label>
    </View>}><Tool /></Suspense>
  </ToolErrorBoundary>;
}
