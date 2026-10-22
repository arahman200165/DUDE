import { useMemo } from 'react';
import { View } from 'react-native';
import { ErrorBanner, InputEditor, OutputViewer, StatusPill, ToolScreen } from '../../kit';
import { useOffThreadRun } from '../../kit/use-off-thread-run';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';
import { oversizeMessage, summaryText } from './diff-mobile';
import { diffTask, type DiffTaskPayload, type DiffTaskResult } from './diff-task';

const TOOL_ID = 'diff';
const DEBOUNCE_MS = 200;

/**
 * Line diff of two texts. Web persists only `paneRatio` for this tool, which has no Android meaning, and the engine has no
 * ignore-whitespace option, so there are no preferences. Both sides are in-memory tool input.
 */
export default function DiffScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { left: '', right: '' });
  const left = typeof stored.left === 'string' ? stored.left : '';
  const right = typeof stored.right === 'string' ? stored.right : '';
  const oversize = oversizeMessage(left.length, right.length);
  const payload = useMemo<DiffTaskPayload | null>(() => (oversize !== null || (left === '' && right === '') ? null : { left, right }), [left, right, oversize]);
  const { result, error: failure, busy } = useOffThreadRun(diffTask, payload, { debounceMs: DEBOUNCE_MS, fallbackError: 'The diff engine failed.' });

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <InputEditor name="left" label="Left (original)" value={left} onChangeText={text => update({ left: text })} />
      <InputEditor name="right" label="Right (changed)" value={right} onChangeText={text => update({ right: text })} />
    </View>}
    options={busy ? <StatusPill testID="tool-busy" tone="busy" label="Comparing" /> : undefined}
    output={oversize !== null
      ? <ErrorBanner message={oversize} />
      : failure !== null
        ? <ErrorBanner message={failure} />
        : result
          ? <View style={{ gap: theme.metrics.spaceNormal }}>
            <Label testID="diff-summary" style={{ fontWeight: '700' }}>{summaryText(result.added, result.removed, result.unchanged)}</Label>
            <Label muted>Lines starting with + were added, - were removed; two spaces are unchanged.</Label>
            <OutputViewer value={result.text} label="Diff" emptyText="The texts are identical." shareTitle="Text diff" />
          </View>
          : <Label muted>{busy ? 'Comparing…' : 'Enter text on both sides to compare.'}</Label>}
  />;
}
