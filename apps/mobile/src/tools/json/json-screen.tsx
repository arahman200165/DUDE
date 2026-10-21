import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { processJson, type JsonIndent, type JsonMode } from '@dude/tool-engine/tools/json/json-format';
import { ErrorBanner, InputEditor, ModeSegment, OutputViewer, ResultCard, StatusPill, ToolScreen, hapticError, useToolPreference } from '../../kit';
import { defineOffThreadTask, isAbortError, runOffThread } from '../../kit/off-thread';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';
import { Button, Label } from '../../ui/primitives';
import {
  decodeIndent, decodeMode, indentId, INDENT_PREFIX, INDENTS, INPUT_TOO_LARGE, JSON_MODES, MAX_INPUT_BYTES, SAMPLE_JSON, toOutcome, utf8ByteLength,
  type JsonOutcome,
} from './json-mobile';

const TOOL_ID = 'json';
const RUN_DELAY_MS = 150;
const INDENT_MODES = INDENTS.map(indent => ({ id: INDENT_PREFIX + indent.id, label: indent.label }));

/** Runs on the worker runtime. Validate returns no output text, so the input does not cross the boundary twice. */
const formatTask = defineOffThreadTask((payload: { input: string; mode: JsonMode; indent: JsonIndent }) => {
  'worklet';
  const result = processJson(payload.input, payload.mode, payload.indent);
  return result.ok && payload.mode === 'validate' ? { ok: true as const, output: '' } : result;
});

/**
 * Same engine and persisted keys as the web tool (`mode`: pretty|minify|validate, `indent`: 2|4|'tab'). The input is session-only.
 * Formatting always runs off the JS thread. The tree, compare and repair views and the web 50 KB inline-worker split are web only.
 * The engine reports line/column only when the JS engine's parse message carries a position, which Hermes messages often do not.
 */
export default function JsonScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [mode, setMode] = useToolPreference<JsonMode>(TOOL_ID, 'mode', 'pretty', { decode: decodeMode });
  const [indent, setIndent] = useToolPreference<JsonIndent>(TOOL_ID, 'indent', 2, { decode: decodeIndent });
  const [outcome, setOutcome] = useState<JsonOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (input === '') { setOutcome(null); setBusy(false); return; }
    if (utf8ByteLength(input) > MAX_INPUT_BYTES) { setOutcome({ ok: false, error: INPUT_TOO_LARGE }); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      runOffThread(formatTask, { input, mode, indent }, { signal: controller.signal }).then(result => {
        setOutcome(toOutcome(result));
        setBusy(false);
      }, (error: unknown) => {
        if (isAbortError(error)) return;
        setOutcome({ ok: false, error: error instanceof Error && error.message ? error.message : 'Could not process this JSON.' });
        setBusy(false);
      });
    }, RUN_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input, mode, indent]);

  useEffect(() => { if (outcome && !outcome.ok) void hapticError(); }, [outcome]);

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment label="Mode" modes={JSON_MODES} value={mode} onChange={next => setMode(next as JsonMode)} />
      <InputEditor value={input} onChangeText={text => update({ input: text })} label="JSON"
        extraActions={<Button testID="tool-input-sample" title="Sample" hint="Fills the input with an example" onPress={() => update({ input: SAMPLE_JSON })} />} />
    </View>}
    options={<View style={{ gap: theme.metrics.spaceNormal }}>
      {mode === 'pretty' && <>
        <Label style={{ fontWeight: '700' }}>Indent</Label>
        <ModeSegment label="Indent" modes={INDENT_MODES} value={INDENT_PREFIX + indentId(indent)} onChange={next => {
          const chosen = INDENTS.find(candidate => INDENT_PREFIX + candidate.id === next);
          if (chosen) setIndent(chosen.value);
        }} />
      </>}
      {busy && <StatusPill testID="tool-busy" tone="busy" label="Working" />}
    </View>}
    output={outcome && !outcome.ok
      ? <ErrorBanner message={outcome.error} />
      : mode === 'validate' && outcome?.ok
        ? <ResultCard tone="success"><StatusPill testID="json-valid" tone="success" label="Valid JSON" /></ResultCard>
        : <OutputViewer value={outcome?.ok ? outcome.output : ''} label={mode === 'minify' ? 'Minified JSON' : 'Formatted JSON'} emptyText="Output appears here." shareTitle="JSON" />}
  />;
}
