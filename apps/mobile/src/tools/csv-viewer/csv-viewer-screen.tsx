import { useMemo } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import type { CsvDelimiter } from '@dude/tool-engine/tools/csv-viewer/csv-convert';
import { ErrorBanner, InputEditor, OptionsSheet, OutputViewer, StatusPill, ToolScreen, useToolPreference } from '../../kit';
import { useOffThreadRun } from '../../kit/use-off-thread-run';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { columnWidths, decodeDelimiter, MAX_RENDERED_ROWS, oversizeMessage, shownLabel, SLOW_INPUT_CHARS, summaryLabel } from './csv-viewer-mobile';
import { csvParseTask, type CsvTaskPayload, type CsvTaskResult } from './csv-viewer-task';

const TOOL_ID = 'csv-viewer';
const SAMPLE = 'name,age\nAda,36\nGrace,45';
const DEBOUNCE_MS = 400;
const GRID_VISIBLE_ROWS = 9;

/** Header row plus a virtualized body, inside one horizontal scroller. The body scrolls vertically inside a bounded height. */
function CsvGrid({ columns, rows }: { readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }) {
  const { theme } = useWorkbench();
  const charWidth = theme.metrics.textMono * 0.62;
  const pad = theme.metrics.spaceNormal;
  const widths = useMemo(() => columnWidths(columns, rows).map(chars => Math.ceil(chars * charWidth + pad * 2)), [columns, rows, charWidth, pad]);
  const gutter = Math.ceil(5 * charWidth + pad * 2);
  const total = gutter + widths.reduce((sum, width) => sum + width, 0);
  const rowHeight = theme.metrics.rowHeight;
  const cell = (key: string, width: number, text: string, bold = false, align?: 'right') => <View key={key} style={{ width, height: rowHeight, justifyContent: 'center', paddingHorizontal: pad }}>
    <Text numberOfLines={1} allowFontScaling style={{ color: theme.colors.text, fontWeight: bold ? '700' : '400', textAlign: align, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{text}</Text>
  </View>;
  return <ScrollView horizontal nestedScrollEnabled testID="csv-grid" accessibilityLabel="CSV table. Scroll sideways for more columns." style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.metrics.radius, backgroundColor: theme.colors.panel }}>
    <View style={{ width: total }}>
      <View style={{ flexDirection: 'row', backgroundColor: theme.colors.panelElevated, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        {cell('gutter', gutter, '#', true, 'right')}
        {columns.map((column, index) => cell(`h${index}`, widths[index]!, column, true))}
      </View>
      <FlatList
        testID="csv-rows"
        nestedScrollEnabled
        data={rows}
        keyExtractor={(_row, index) => String(index)}
        style={{ height: rowHeight * GRID_VISIBLE_ROWS }}
        getItemLayout={(_data, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
        initialNumToRender={GRID_VISIBLE_ROWS + 3}
        windowSize={7}
        renderItem={({ item, index }) => <View style={{ flexDirection: 'row', backgroundColor: index % 2 === 0 ? theme.colors.panel : theme.colors.panelElevated }}>
          {cell('gutter', gutter, String(index + 1), false, 'right')}
          {columns.map((_column, column) => cell(`c${column}`, widths[column]!, item[column] ?? ''))}
        </View>}
      />
    </View>
  </ScrollView>;
}

const DELIMITER_OPTIONS = [
  { kind: 'select', id: 'delimiter', label: 'Delimiter', default: ',', choices: [{ value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }] },
  { kind: 'switch', id: 'hasHeaderRow', label: 'First row is a header', default: true },
] as const;

export default function CsvViewerScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  // Web keys `delimiter` (',' | ';' | tab) and `hasHeaderRow`.
  const [delimiter, setDelimiter] = useToolPreference<CsvDelimiter>(TOOL_ID, 'delimiter', ',', { decode: decodeDelimiter });
  const [hasHeaderRow, setHasHeaderRow] = useToolPreference<boolean>(TOOL_ID, 'hasHeaderRow', true, { decode: raw => typeof raw === 'boolean' ? raw : null });
  const oversize = oversizeMessage(input.length);
  const payload = useMemo<CsvTaskPayload | null>(
    () => (input.trim() === '' || oversize !== null ? null : { input, delimiter, hasHeaderRow, maxRows: MAX_RENDERED_ROWS }),
    [input, delimiter, hasHeaderRow, oversize],
  );
  const { result, error: failure, busy } = useOffThreadRun(csvParseTask, payload, { debounceMs: DEBOUNCE_MS, fallbackError: 'The CSV engine failed.' });

  return <ToolScreen
    input={<InputEditor value={input} onChangeText={text => update({ input: text })} label="CSV"
      extraActions={<Button testID="tool-input-sample" title="Sample" hint="Fills the input with an example" onPress={() => update({ input: SAMPLE })} />} />}
    options={<View style={{ gap: theme.metrics.spaceNormal }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
        <OptionsSheet
          options={DELIMITER_OPTIONS}
          values={{ delimiter, hasHeaderRow }}
          onChange={(id, value) => {
            if (id === 'delimiter') { const next = decodeDelimiter(value); if (next !== null) setDelimiter(next); } else if (id === 'hasHeaderRow') setHasHeaderRow(value === true);
          }} />
        {busy && <StatusPill testID="tool-busy" tone="busy" label="Parsing" />}
      </View>
      {busy && input.length > SLOW_INPUT_CHARS && <Label muted>Large input: parsing can take several seconds. You can keep editing; only the latest text is parsed.</Label>}
    </View>}
    output={oversize !== null
      ? <ErrorBanner message={oversize} />
      : failure !== null
        ? <ErrorBanner message={failure} />
        : result && !result.ok
          ? <ErrorBanner message={result.error} />
          : result
            ? <View style={{ gap: theme.metrics.spaceMajor }}>
              <View style={{ gap: theme.metrics.spaceMicro }}>
                <Label testID="csv-summary" style={{ fontWeight: '700' }}>{summaryLabel(result.totalRows, result.columns.length)}</Label>
                <Label testID="csv-shown" muted>{shownLabel(result.rows.length, result.totalRows)}</Label>
              </View>
              <CsvGrid columns={result.columns} rows={result.rows} />
              <OutputViewer value={result.json} label="JSON" shareTitle="CSV as JSON" />
            </View>
            : <Label muted>{busy ? 'Parsing…' : 'Paste CSV to see it as a table.'}</Label>}
  />;
}
