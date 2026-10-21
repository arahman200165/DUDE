import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { XmlFormatResult, XmlIndent, XmlMode } from '@dude/tool-engine/tools/xml-formatter/xml-format';
import { ErrorBanner, InputEditor, ModeSegment, OptionsSheet, OutputViewer, StatusPill, ToolScreen, useToolPreference } from '../../kit';
import { isAbortError, runOffThread } from '../../kit/off-thread';
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

type Run = { readonly status: 'idle' | 'running' | 'done'; readonly result: XmlFormatResult | null; readonly failure: string | null };
const IDLE: Run = { status: 'idle', result: null, failure: null };

/** Debounced off-thread run; a stale run is aborted (never dispatched, or its result dropped) when the payload changes. */
function useXmlRun(payload: XmlTaskPayload | null): Run {
  const [run, setRun] = useState<Run>(IDLE);
  useEffect(() => {
    if (payload === null) { setRun(IDLE); return undefined; }
    const controller = new AbortController();
    setRun(previous => ({ ...previous, status: 'running' }));
    const timer = setTimeout(() => {
      runOffThread(xmlFormatTask, payload, { signal: controller.signal }).then(
        result => setRun({ status: 'done', result, failure: null }),
        (error: unknown) => {
          if (isAbortError(error)) return;
          setRun({ status: 'done', result: null, failure: error instanceof Error && error.message ? error.message : 'The XML engine failed.' });
        },
      );
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [payload]);
  return run;
}

export default function XmlFormatterScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [mode, setMode] = useToolPreference<XmlMode>(TOOL_ID, 'mode', 'format', { decode: decodeMode });
  const [indent, setIndent] = useToolPreference<XmlIndent>(TOOL_ID, 'indent', 2, { decode: decodeIndent });
  const payload = useMemo<XmlTaskPayload | null>(() => (input.trim() === '' ? null : { input, mode, indent }), [input, mode, indent]);
  const run = useXmlRun(payload);
  const result = payload === null ? null : run.result;
  const failure = payload === null ? null : run.failure;

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
      {run.status === 'running' && payload !== null && <StatusPill testID="tool-busy" tone="busy" label="Working" />}
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
