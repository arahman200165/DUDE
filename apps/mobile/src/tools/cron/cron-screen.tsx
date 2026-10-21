import { useMemo } from 'react';
import { View } from 'react-native';
import { ErrorBanner, InputEditor, KeyValueList, ModeSegment, OptionsSheet, OutputViewer, ResultCard, ToolScreen, useToolPreferences, type OptionSpec } from '../../kit';
import { coerceOption } from '../../kit/text-tool-controller';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { CRON_PRESETS, cronView, type CronDirection } from './cron-mobile';

const TOOL_ID = 'cron';

// Preference keys are the web tool's persisted keys: `occurrenceCount`, `tzMode` and `direction`.
const COUNT_OPTION: OptionSpec = { kind: 'number', id: 'occurrenceCount', label: 'Runs to show (1 to 25)', default: 5, min: 1, max: 25 };
const TZ_MODES = [{ id: 'local', label: 'Device time' }, { id: 'utc', label: 'UTC' }] as const;
const DIRECTIONS = [{ id: 'next', label: 'Next runs' }, { id: 'previous', label: 'Previous runs' }] as const;
const ENTRIES = [
  { key: 'occurrenceCount', defaultValue: 5 as unknown, codec: { decode: (raw: unknown) => coerceOption(COUNT_OPTION, raw) } },
  { key: 'tzMode', defaultValue: 'local' as unknown, codec: { decode: (raw: unknown) => raw === 'local' || raw === 'utc' ? raw : null } },
  { key: 'direction', defaultValue: 'next' as unknown, codec: { decode: (raw: unknown) => raw === 'next' || raw === 'previous' ? raw : null } },
];

export default function CronScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [prefs, setPref] = useToolPreferences(TOOL_ID, ENTRIES);
  const count = Number(prefs.occurrenceCount);
  const tz = prefs.tzMode === 'utc' ? 'utc' : 'local';
  const direction: CronDirection = prefs.direction === 'previous' ? 'previous' : 'next';

  // Runs are relative to the moment the expression or display options last changed.
  const outcome = useMemo(() => input.trim() === '' ? null : cronView(input, { count, tz, direction }), [input, count, tz, direction]);

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <InputEditor value={input} onChangeText={text => update({ input: text })} label="Cron expression" placeholder="*/15 * * * * or @daily" />
      <View accessibilityRole="toolbar" accessibilityLabel="Example expressions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
        {CRON_PRESETS.map(preset => <Button key={preset.id} testID={`preset-${preset.id}`} title={preset.label} hint={`Uses ${preset.expression}`} onPress={() => update({ input: preset.expression })} />)}
      </View>
    </View>}
    options={<View style={{ gap: theme.metrics.spaceNormal }}>
      <ModeSegment label="Direction" modes={DIRECTIONS} value={direction} onChange={next => setPref('direction', next)} />
      <ModeSegment label="Display time zone" modes={TZ_MODES} value={tz} onChange={next => setPref('tzMode', next)} />
      <View style={{ flexDirection: 'row' }}>
        <OptionsSheet options={[COUNT_OPTION]} values={{ occurrenceCount: count }} onChange={(_id, value) => setPref('occurrenceCount', coerceOption(COUNT_OPTION, value))} />
      </View>
    </View>}
    output={outcome === null ? <Label muted>Enter a cron expression or pick an example.</Label>
      : !outcome.ok ? <ErrorBanner message={outcome.error} />
        : <View style={{ gap: theme.metrics.spaceMajor }}>
          <OutputViewer value={outcome.view.description} label="Description" />
          <ResultCard title={direction === 'next' ? 'Next runs' : 'Previous runs'}>
            <Label muted>{tz === 'utc' ? 'Shown in UTC' : 'Shown in device time'}</Label>
            <KeyValueList rows={outcome.view.runs} />
          </ResultCard>
          {outcome.view.fields.length > 0 && <ResultCard title="Fields"><KeyValueList rows={outcome.view.fields} /></ResultCard>}
        </View>}
  />;
}
