import { View } from 'react-native';
import { ErrorBanner, InputEditor, KeyValueList, ModeSegment, OutputViewer, ResultCard, ToolScreen, useToolPreference } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';
import { Field, Label } from '../../ui/primitives';
import {
  compareRows, coverageView, decodeSemverMode, decodeSortDirection, DEFAULT_INPUTS, rangeRows, SEMVER_MODES, sortView,
  type RowsOutcome, type SemverMode, type SortDirection,
} from './semver-comparator-mobile';

const TOOL_ID = 'semver-comparator';
const DIR_PREFIX = 'dir-';
const DIRECTIONS = [{ id: `${DIR_PREFIX}asc`, label: 'Ascending' }, { id: `${DIR_PREFIX}desc`, label: 'Descending' }];

/**
 * Modes mirror web's tabs. Persisted preferences use the web keys `tab` and `sortDirection`; every version, range and list is session input
 * (in memory only) with the web defaults. The Visualize mode lists the probe versions each range covers instead of web's wide grid.
 */
export default function SemverComparatorScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput<Record<string, unknown>>(TOOL_ID, { ...DEFAULT_INPUTS });
  const text = (key: keyof typeof DEFAULT_INPUTS): string => typeof stored[key] === 'string' ? stored[key] as string : DEFAULT_INPUTS[key];
  const [mode, setMode] = useToolPreference<SemverMode>(TOOL_ID, 'tab', 'compare', { decode: decodeSemverMode });
  const [direction, setDirection] = useToolPreference<SortDirection>(TOOL_ID, 'sortDirection', 'asc', { decode: decodeSortDirection });
  const mono = { fontFamily: theme.fonts.monoFamily, fontSize: theme.metrics.textMono };
  const plain = { autoCorrect: false, autoCapitalize: 'none', autoComplete: 'off', spellCheck: false, importantForAutofill: 'no' } as const;

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment modes={SEMVER_MODES} value={mode} onChange={next => setMode(next as SemverMode)} />
      {mode === 'compare' && <>
        <Field testID="tool-input-a" label="Version A" value={text('versionA')} onChangeText={value => update({ versionA: value })} style={mono} {...plain} />
        <Field testID="tool-input-b" label="Version B" value={text('versionB')} onChangeText={value => update({ versionB: value })} style={mono} {...plain} />
      </>}
      {mode === 'sort' && <>
        <ModeSegment label="Direction" modes={DIRECTIONS} value={DIR_PREFIX + direction} onChange={next => setDirection(next.slice(DIR_PREFIX.length) as SortDirection)} />
        <InputEditor label="Versions (one per line)" value={text('list')} onChangeText={value => update({ list: value })} />
      </>}
      {mode === 'range' && <>
        <Field testID="tool-input-version" label="Version" value={text('rangeVersion')} onChangeText={value => update({ rangeVersion: value })} style={mono} {...plain} />
        <Field testID="tool-input-range" label="Range" value={text('range')} onChangeText={value => update({ range: value })} style={mono} {...plain} />
      </>}
      {mode === 'visualize' && <InputEditor label="Ranges (one per line)" value={text('visualizeInput')} onChangeText={value => update({ visualizeInput: value })} />}
    </View>}
    output={<View style={{ gap: theme.metrics.spaceMajor }}>
      {mode === 'compare' && <Rows outcome={compareRows(text('versionA'), text('versionB'))} />}
      {mode === 'range' && <Rows outcome={rangeRows(text('rangeVersion'), text('range'))} />}
      {mode === 'sort' && <SortOutput list={text('list')} direction={direction} />}
      {mode === 'visualize' && <Coverage input={text('visualizeInput')} />}
    </View>}
  />;
}

function Rows({ outcome }: { readonly outcome: RowsOutcome }) {
  return outcome.ok ? <KeyValueList rows={outcome.rows} /> : <ErrorBanner message={outcome.error} />;
}

function SortOutput({ list, direction }: { readonly list: string; readonly direction: SortDirection }) {
  const { theme } = useWorkbench();
  const view = sortView(list, direction);
  return <View style={{ gap: theme.metrics.spaceMajor }}>
    <OutputViewer value={view.sorted} label="Sorted" emptyText="No valid versions." />
    {view.invalid.length > 0 && <ErrorBanner message={`Skipped invalid versions: ${view.invalid.join(', ')}`} />}
  </View>;
}

function Coverage({ input }: { readonly input: string }) {
  const { theme } = useWorkbench();
  const entries = coverageView(input);
  if (!entries.length) return <Label muted>Enter one range per line.</Label>;
  return <View style={{ gap: theme.metrics.spaceMajor }}>
    {entries.map((entry, index) => entry.ok
      ? <ResultCard key={index} title={entry.range}>
        <Label testID={`viz-${index}-matches`} mono>Matches: {entry.matched}</Label>
        {/* Decorative strip: the line above carries the same information for screen readers. */}
        <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceMicro }}>
          {entry.cells.map(cell => <View key={cell.version} style={{
            paddingHorizontal: theme.metrics.spaceNormal, paddingVertical: theme.metrics.spaceMicro, borderRadius: theme.metrics.radius, borderWidth: 1,
            borderColor: cell.match ? theme.colors.accent : theme.colors.border, backgroundColor: cell.match ? theme.colors.accent : theme.colors.panel,
          }}>
            <Label mono style={{ color: cell.match ? theme.colors.onAccent : theme.colors.textMuted, fontSize: theme.metrics.textUiSm }}>{cell.match ? '✓ ' : ''}{cell.version}</Label>
          </View>)}
        </View>
      </ResultCard>
      : <ErrorBanner key={index} message={entry.error} />)}
  </View>;
}
