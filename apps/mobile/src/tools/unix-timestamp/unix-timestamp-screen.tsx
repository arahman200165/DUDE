import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { ErrorBanner, InputEditor, KeyValueList, OptionsSheet, ResultCard, ToolScreen, useToolPreference, type OptionSpec } from '../../kit';
import { coerceOption } from '../../kit/text-tool-controller';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { msToUnit, type TimestampUnit } from '@dude/tool-engine/tools/unix-timestamp/timestamp-convert';
import { TIMESTAMP_UNITS, timestampRows } from './unix-timestamp-mobile';

const TOOL_ID = 'unix-timestamp';

// Preference key `unit` is the web tool's persisted key. Display is always both UTC and device-local, so the web `tz` key is not needed.
const UNIT_OPTION: OptionSpec = {
  kind: 'select', id: 'unit', label: 'Input unit', default: 'auto',
  choices: TIMESTAMP_UNITS.map(value => ({ value, label: value === 'auto' ? 'Auto-detect' : value[0]!.toUpperCase() + value.slice(1) })),
};
const decodeUnit = (raw: unknown): TimestampUnit | null => typeof raw === 'string' && (TIMESTAMP_UNITS as readonly string[]).includes(raw) ? raw as TimestampUnit : null;

export default function UnixTimestampScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [unit, setUnit] = useToolPreference<TimestampUnit>(TOOL_ID, 'unit', 'auto', { decode: decodeUnit });

  // Live "now" card: ticks once a second, can be paused, stops while the app is in the background. There is no animation.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [running, setRunning] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!running || !foreground) return undefined;
    setNowMs(Date.now());
    const handle = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [running, foreground]);

  const result = useMemo(() => input.trim() === '' ? null : timestampRows(input, unit, nowMs), [input, unit, nowMs]);
  const useNow = () => {
    const now = Date.now();
    setNowMs(now);
    update({ input: String(msToUnit(now, unit === 'auto' ? 'seconds' : unit)) });
  };

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ResultCard title="Now">
        <View style={{ gap: theme.metrics.spaceMicro }}>
          <Label muted style={{ fontSize: theme.metrics.textUiSm }}>Unix seconds</Label>
          <Label testID="now-seconds" mono selectable accessibilityLiveRegion="none">{String(Math.floor(nowMs / 1000))}</Label>
        </View>
        <View style={{ gap: theme.metrics.spaceMicro }}>
          <Label muted style={{ fontSize: theme.metrics.textUiSm }}>Unix milliseconds</Label>
          <Label testID="now-ms" mono selectable accessibilityLiveRegion="none">{String(nowMs)}</Label>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
          <Button testID="now-toggle" title={running ? 'Pause' : 'Resume'} hint={running ? 'Stops the clock updating' : 'Starts the clock updating'} onPress={() => setRunning(value => !value)} />
          <Button testID="tool-use-now" title="Use now" hint="Puts the current time into the input" onPress={useNow} />
        </View>
      </ResultCard>
      <InputEditor value={input} onChangeText={text => update({ input: text })} label="Timestamp or date (epoch, ISO 8601, HTTP-date, RFC 2822)" />
    </View>}
    options={<OptionsSheet options={[UNIT_OPTION]} values={{ unit }} onChange={(_id, value) => setUnit(coerceOption(UNIT_OPTION, value) as TimestampUnit)} />}
    output={result === null ? <Label muted>Enter a timestamp or tap Use now.</Label>
      : result.ok ? <KeyValueList rows={Array.isArray(result.output) ? result.output : []} />
        : <ErrorBanner message={result.error} />}
  />;
}
