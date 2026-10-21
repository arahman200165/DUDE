import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { convertYaml, type JsonIndent, type YamlDirection } from '@dude/tool-engine/tools/yaml-json/yaml-convert';
import { ErrorBanner, InputEditor, ModeSegment, OutputViewer, StatusPill, ToolScreen, hapticError, useToolPreference } from '../../kit';
import { defineOffThreadTask, isAbortError, runOffThread } from '../../kit/off-thread';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';
import { Button, Label } from '../../ui/primitives';
import {
  decodeDirection, decodeIndent, DIRECTIONS, flipDirection, indentId, INDENT_PREFIX, INDENTS, INPUT_TOO_LARGE, MAX_INPUT_BYTES, SAMPLES, toOutcome, utf8ByteLength,
  type YamlOutcome,
} from './yaml-json-mobile';

const TOOL_ID = 'yaml-json';
const RUN_DELAY_MS = 150;
const INDENT_MODES = INDENTS.map(indent => ({ id: INDENT_PREFIX + indent.id, label: indent.label }));

/** Runs on the worker runtime (js-yaml is imported by the engine module and bundled for the worker). */
const convertTask = defineOffThreadTask((payload: { input: string; direction: YamlDirection; indent: JsonIndent }) => {
  'worklet';
  return convertYaml(payload.input, payload.direction, payload.indent);
});

/**
 * Same engine and persisted keys as the web tool (`direction`: yaml-to-json|json-to-yaml, `indent`: 2|4|'tab', used for the JSON
 * output). The input is session-only. Conversion always runs off the JS thread. Swap moves the output into the input and flips
 * the direction, like the web tool. The web split-pane ratio does not apply to the single-column layout.
 */
export default function YamlJsonScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [direction, setDirection] = useToolPreference<YamlDirection>(TOOL_ID, 'direction', 'yaml-to-json', { decode: decodeDirection });
  const [indent, setIndent] = useToolPreference<JsonIndent>(TOOL_ID, 'indent', 2, { decode: decodeIndent });
  const [outcome, setOutcome] = useState<YamlOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (input === '') { setOutcome(null); setBusy(false); return; }
    if (utf8ByteLength(input) > MAX_INPUT_BYTES) { setOutcome({ ok: false, error: INPUT_TOO_LARGE }); setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      runOffThread(convertTask, { input, direction, indent }, { signal: controller.signal }).then(result => {
        setOutcome(toOutcome(result));
        setBusy(false);
      }, (error: unknown) => {
        if (isAbortError(error)) return;
        setOutcome({ ok: false, error: error instanceof Error && error.message ? error.message : 'Could not convert this input.' });
        setBusy(false);
      });
    }, RUN_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [input, direction, indent]);

  useEffect(() => { if (outcome && !outcome.ok) void hapticError(); }, [outcome]);

  const swapText = outcome?.ok && !busy ? outcome.output : null;
  const toYaml = direction === 'json-to-yaml';

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment label="Direction" modes={DIRECTIONS} value={direction} onChange={next => setDirection(next as YamlDirection)} />
      <InputEditor value={input} onChangeText={text => update({ input: text })} label={toYaml ? 'JSON' : 'YAML'}
        onSwap={() => { if (swapText !== null) { update({ input: swapText }); setDirection(flipDirection(direction)); } }} swapDisabled={swapText === null}
        extraActions={<Button testID="tool-input-sample" title="Sample" hint="Fills the input with an example" onPress={() => update({ input: SAMPLES[direction] })} />} />
    </View>}
    options={<View style={{ gap: theme.metrics.spaceNormal }}>
      {!toYaml && <>
        <Label style={{ fontWeight: '700' }}>JSON indent</Label>
        <ModeSegment label="JSON indent" modes={INDENT_MODES} value={INDENT_PREFIX + indentId(indent)} onChange={next => {
          const chosen = INDENTS.find(candidate => INDENT_PREFIX + candidate.id === next);
          if (chosen) setIndent(chosen.value);
        }} />
      </>}
      {busy && <StatusPill testID="tool-busy" tone="busy" label="Working" />}
    </View>}
    output={outcome && !outcome.ok
      ? <ErrorBanner message={outcome.error} />
      : <OutputViewer value={outcome?.ok ? outcome.output : ''} label={toYaml ? 'YAML' : 'JSON'} emptyText="Output appears here." shareTitle={toYaml ? 'YAML' : 'JSON'} />}
  />;
}
