import { useMemo } from 'react';
import { View } from 'react-native';
import type { XmlIndent, XmlMode } from '@dude/tool-engine/tools/xml-formatter/xml-format';
import { ErrorBanner, InputEditor, ModeSegment, OptionsSheet, OutputViewer, StatusPill, ToolScreen, useToolPreference } from '../../kit';
import { useOffThreadRun } from '../../kit/use-off-thread-run';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button } from '../../ui/primitives';
import { xmlFormatTask, type XmlTaskPayload } from './xml-formatter-task';

const TOOL_ID = 'xml-formatter';
const MODES: readonly { readonly id: XmlMode; readonly label: string }[] = [
  { id: 'format', label: 'Format' },
  { id: 'minify', label: 'Minify' },
  { id: 'validate', label: 'Validate' },
];
const SAMPLE = '<?xml version="1.0"?><catalog><book id="bk101"><title>Midnight Rain</title><price currency="USD">44.95</price></book></catalog>';
const DEBOUNCE_MS = 200;

/** Web keys: `mode` (`format` | `minify` | `validate`) and `indent` (2 | 4 | 'tab', stored as the bare JSON value, as web does). */
const decodeMode = (raw: unknown): XmlMode | null => (raw === 'format' || raw === 'minify' || raw === 'validate' ? raw : null);
const decodeIndent = (raw: unknown): XmlIndent | null => (raw === 2 || raw === 4 || raw === 'tab' ? raw : null);

export default function XmlFormatterScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [mode, setMode] = useToolPreference<XmlMode>(TOOL_ID, 'mode', 'format', { decode: decodeMode });
  const [indent, setIndent] = useToolPreference<XmlIndent>(TOOL_ID, 'indent', 2, { decode: decodeIndent });
  const payload = useMemo<XmlTaskPayload | null>(() => (input.trim() === '' ? null : { input, mode, indent }), [input, mode, indent]);
  const { result, error: failure, busy } = useOffThreadRun(xmlFormatTask, payload, { debounceMs: DEBOUNCE_MS, fallbackError: 'The XML engine failed.' });

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment modes={MODES} value={mode} onChange={next => setMode(next as XmlMode)} />
      <InputEditor value={input} onChangeText={text => update({ input: text })} label="XML"
        extraActions={<Button testID="tool-input-sample" title="Sample" hint="Fills the input with an example" onPress={() => update({ input: SAMPLE })} />} />
    </View>}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet
        options={[{ kind: 'select', id: 'indent', label: 'Indent', default: '2', choices: [{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }] }]}
        values={{ indent: String(indent) }}
        onChange={(_id, value) => { const next = decodeIndent(value === 'tab' ? 'tab' : Number(value)); if (next !== null) setIndent(next); }} />
      {busy && <StatusPill testID="tool-busy" tone="busy" label="Working" />}
    </View>}
    output={failure !== null
      ? <ErrorBanner message={failure} />
      : result && !result.ok
        ? <ErrorBanner message={result.error.line !== undefined ? `${result.error.message} (line ${result.error.line}, column ${result.error.column ?? 1})` : result.error.message} />
        : <View style={{ gap: theme.metrics.spaceNormal }}>
          {result?.ok && mode === 'validate' && <StatusPill testID="xml-valid" tone="success" label="Valid XML" />}
          <OutputViewer value={result?.ok ? result.output : ''} label="Output" emptyText="Output appears here." />
        </View>}
  />;
}
