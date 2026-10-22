import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { View } from 'react-native';
import { useToolInput } from '../tools-host/use-tool-input';
import { useWorkbench } from '../state/workbench-provider';
import { Button } from '../ui/primitives';
import { ErrorBanner, InputEditor, KeyValueList, ModeSegment, OutputViewer, StatusPill, ToolScreen } from './components';
import { OpenFileButton } from './file-actions';
import { fileInputLimitFor } from './file-io-core';
import { hapticError } from './feedback';
import { OptionsSheet } from './options-sheet';
import { useCrossingHaptic } from './use-crossing-haptic';
import {
  coerceOption, createTextToolController, optionKey, resolveModes,
  type OptionSpec, type OptionValue, type OptionValues, type TextToolSpec,
} from './text-tool-controller';
import { useToolPreferences, type PreferenceEntry } from './tool-preferences';

export type { KeyValueRow, OptionChoice, OptionSpec, OptionValues, TextToolMode, TextToolSpec, ToolRunResult } from './text-tool-controller';

/**
 * Declarative text-in/text-out tool screen (Phase 31I decision 4). Returns a component to use as the tool screen's
 * `default` export. Input is in memory only (`useToolInput`); the mode and options are tool preferences, so they follow the
 * manifest's persistence policy (`local` preferences persist and sync under the same keys as web; the rest stay in memory).
 *
 * testIDs: `mode-<id>`, `tool-input`, `tool-input-paste|clear|swap|sample|open`, `tool-options`, `option-<id>`, `tool-run`,
 * `tool-output`, `tool-output-copy|share|save`, `kv-<key>`, `tool-error`.
 */
export function defineTextTool<O extends OptionValues = OptionValues>(spec: TextToolSpec<O>): ComponentType {
  const modes = resolveModes(spec);
  const optionSpecs: readonly OptionSpec[] = spec.options ?? [];
  const modeKey = spec.modeKey ?? 'mode';
  const live = spec.live !== false;
  const openFile = spec.openFile ?? fileInputLimitFor(spec.toolId).supported;
  const entries: readonly PreferenceEntry[] = [
    { key: modeKey, defaultValue: modes[0]!.id, codec: { decode: raw => typeof raw === 'string' && modes.some(mode => mode.id === raw) ? raw : null } },
    ...optionSpecs.map(option => ({ key: optionKey(option), defaultValue: option.default as unknown, codec: { decode: (raw: unknown) => coerceOption(option, raw) } })),
  ];

  function TextTool() {
    const { theme } = useWorkbench();
    const [stored, update] = useToolInput(spec.toolId, { input: '' });
    const input = typeof stored.input === 'string' ? stored.input : '';
    const [prefs, setPref] = useToolPreferences(spec.toolId, entries);
    const modeId = String(prefs[modeKey] ?? modes[0]!.id);
    const optionValues = useMemo<OptionValues>(
      () => Object.fromEntries(optionSpecs.map(option => [option.id, prefs[optionKey(option)] as OptionValue])),
      [prefs],
    );
    const optionsSignature = JSON.stringify(optionValues);

    const [controller] = useState(() => createTextToolController<O>(spec));
    const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
    const latest = useRef({ input, modeId, optionValues });
    latest.current = { input, modeId, optionValues };
    useEffect(() => {
      controller.setRequest({ input: latest.current.input, modeId: latest.current.modeId, options: latest.current.optionValues });
      return () => controller.dispose();
    }, [controller, input, modeId, optionsSignature]);

    const result = state.result;
    const lastErrorHaptic = useRef<unknown>(null);
    useEffect(() => {
      // The size error is re-issued on every keystroke over the budget; it gets one haptic per crossing instead (below).
      if (result && !result.ok && !state.overBudget && lastErrorHaptic.current !== result) { lastErrorHaptic.current = result; void hapticError(); }
    }, [result, state.overBudget]);
    useCrossingHaptic(state.overBudget);

    const swapText = result?.ok && typeof result.output === 'string' ? result.output : null;
    const onSwap = useCallback(() => {
      const text = controller.takeSwap();
      if (text !== null) update({ input: text });
    }, [controller, update]);
    const onOption = useCallback((id: string, value: OptionValue) => {
      const option = optionSpecs.find(candidate => candidate.id === id);
      if (option) setPref(optionKey(option), coerceOption(option, value));
    }, [setPref]);

    return <ToolScreen
      input={<View style={{ gap: theme.metrics.spaceMajor }}>
        {modes.length > 1 && <ModeSegment modes={modes} value={modeId} onChange={next => setPref(modeKey, next)} />}
        <InputEditor value={input} onChangeText={text => update({ input: text })} label={spec.inputLabel ?? 'Input'}
          onSwap={spec.swap ? onSwap : undefined} swapDisabled={swapText === null}
          extraActions={(spec.sampleInput !== undefined || openFile) ? <>
            {spec.sampleInput !== undefined && <Button testID="tool-input-sample" title="Sample" hint="Fills the input with an example" onPress={() => update({ input: spec.sampleInput! })} />}
            {openFile && <OpenFileButton toolId={spec.toolId} onText={text => update({ input: text })} />}
          </> : undefined} />
      </View>}
      options={(optionSpecs.length > 0 || !live) ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
        <OptionsSheet options={optionSpecs} values={optionValues} onChange={onOption} />
        {!live && <Button testID="tool-run" title="Run" onPress={() => { void controller.runNow(); }} />}
        {state.status === 'running' && <StatusPill tone="busy" label="Working" />}
      </View> : state.status === 'running' ? <StatusPill tone="busy" label="Working" /> : undefined}
      output={result && !result.ok
        ? <ErrorBanner message={result.error} />
        : result && result.ok && typeof result.output !== 'string'
          ? <KeyValueList rows={result.output} />
          : spec.outputKind === 'kv' && !result ? null
            : <OutputViewer value={result?.ok && typeof result.output === 'string' ? result.output : ''} label={spec.outputLabel ?? 'Output'} emptyText="Output appears here." toolId={spec.toolId} />}
    />;
  }
  TextTool.displayName = `TextTool(${spec.toolId})`;
  return TextTool;
}
