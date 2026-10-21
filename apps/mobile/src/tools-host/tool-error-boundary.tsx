import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { View } from 'react-native';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label } from '../ui/primitives';

interface BoundaryProps {
  readonly renderError: (error: Error, reload: () => void) => ReactNode;
  /** Runs before the boundary clears, so the caller can create a fresh lazy loader (a rejected import is cached). */
  readonly onReload?: () => void;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}
interface BoundaryState { readonly error: Error | null }

/** Keeps a throwing or failed-to-load tool local: the shell, header and navigation survive. */
class Boundary extends Component<PropsWithChildren<BoundaryProps>, BoundaryState> {
  override state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: unknown): BoundaryState { return { error: error instanceof Error ? error : new Error(String(error)) }; }
  override componentDidCatch(error: Error, info: ErrorInfo): void { this.props.onError?.(error, info); }
  private reload = (): void => { this.props.onReload?.(); this.setState({ error: null }); };
  override render(): ReactNode { return this.state.error ? this.props.renderError(this.state.error, this.reload) : this.props.children; }
}

/** Error card with a Reload action. Tool input is not logged or displayed. */
export function ToolErrorBoundary({ toolTitle, onReload, children }: PropsWithChildren<{ readonly toolTitle: string; readonly onReload?: () => void }>) {
  const { theme } = useWorkbench();
  return <Boundary onReload={onReload} renderError={(error, reload) => <View accessibilityRole="alert" style={{ gap: theme.metrics.spaceNormal, padding: theme.metrics.spacePanel, borderWidth: 1, borderColor: theme.status.error, borderRadius: theme.metrics.radius, backgroundColor: theme.colors.panel }}>
    <Label style={{ color: theme.status.error, fontWeight: '700' }}>! {toolTitle} stopped working</Label>
    <Label>The rest of DUDE is unaffected. Reload the tool to try again.</Label>
    <Label muted mono>{error.message || 'Unknown error'}</Label>
    <Button title="Reload tool" onPress={reload} />
  </View>}>{children}</Boundary>;
}
