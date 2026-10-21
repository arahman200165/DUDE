import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import { ErrorBanner, ModeSegment, OptionsSheet, OutputViewer, ToolScreen, useToolPreferences, type OptionSpec, type OptionValues } from '../../kit';
import { coerceOption, optionKey } from '../../kit/text-tool-controller';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { generateSecret, type GeneratorMode, type GeneratorOutcome, type GeneratorValues } from './password-generator-mobile';

const TOOL_ID = 'password-generator';
const MODES = [{ id: 'password', label: 'Password' }, { id: 'passphrase', label: 'Passphrase' }] as const;

// Preference keys are the web tool's persisted keys (`mode`, `length`, `useUppercase`, ...). Only options are persisted:
// the generated secret lives in this component's state and is dropped when the app leaves the foreground.
const PASSWORD_OPTIONS: readonly OptionSpec[] = [
  { kind: 'number', id: 'length', label: 'Length', default: 16, min: 1, max: 256 },
  { kind: 'switch', id: 'useUppercase', label: 'Uppercase (A-Z)', default: true },
  { kind: 'switch', id: 'useLowercase', label: 'Lowercase (a-z)', default: true },
  { kind: 'switch', id: 'useDigits', label: 'Digits (0-9)', default: true },
  { kind: 'switch', id: 'useSymbols', label: 'Symbols', default: true },
  { kind: 'switch', id: 'excludeAmbiguous', label: 'Exclude ambiguous (0 O o l 1 I)', default: false },
];
const PASSPHRASE_OPTIONS: readonly OptionSpec[] = [
  { kind: 'number', id: 'wordCount', label: 'Words', default: 6, min: 1, max: 20 },
  { kind: 'text', id: 'separator', label: 'Separator', default: '-' },
  { kind: 'switch', id: 'capitalize', label: 'Capitalize words', default: false },
  { kind: 'switch', id: 'includeDigit', label: 'Append a digit', default: true },
];
const ALL_OPTIONS = [...PASSWORD_OPTIONS, ...PASSPHRASE_OPTIONS];
const ENTRIES = [
  { key: 'mode', defaultValue: 'password' as unknown, codec: { decode: (raw: unknown) => raw === 'password' || raw === 'passphrase' ? raw : null } },
  ...ALL_OPTIONS.map(option => ({ key: optionKey(option), defaultValue: option.default as unknown, codec: { decode: (raw: unknown) => coerceOption(option, raw) } })),
];

export default function PasswordGeneratorScreen() {
  const { theme } = useWorkbench();
  const [prefs, setPref] = useToolPreferences(TOOL_ID, ENTRIES);
  const mode: GeneratorMode = prefs.mode === 'passphrase' ? 'passphrase' : 'password';
  const values = useMemo<OptionValues>(() => Object.fromEntries(ALL_OPTIONS.map(option => [option.id, prefs[optionKey(option)] as never])), [prefs]);
  const signature = `${mode}|${JSON.stringify(values)}`;
  const [outcome, setOutcome] = useState<GeneratorOutcome | null>(null);

  useEffect(() => { setOutcome(null); }, [signature]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') setOutcome(null); });
    return () => subscription.remove();
  }, []);

  const shown = mode === 'password' ? PASSWORD_OPTIONS : PASSPHRASE_OPTIONS;
  const generate = () => setOutcome(generateSecret(mode, values as unknown as GeneratorValues));

  return <ToolScreen
    input={<ModeSegment modes={MODES} value={mode} onChange={next => setPref('mode', next)} />}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet options={shown} values={values} onChange={(id, value) => { const option = ALL_OPTIONS.find(candidate => candidate.id === id); if (option) setPref(optionKey(option), coerceOption(option, value)); }} />
      <Button testID="tool-run" title="Generate" hint="Generates a new value with the current options" onPress={generate} />
    </View>}
    output={outcome && !outcome.ok
      ? <ErrorBanner message={outcome.error} />
      : <View style={{ gap: theme.metrics.spaceNormal }}>
        <OutputViewer value={outcome?.ok ? outcome.value : ''} label={mode === 'password' ? 'Password' : 'Passphrase'} emptyText="Tap Generate." />
        {outcome?.ok && <Label testID="tool-entropy" muted>About {outcome.entropyBits.toFixed(1)} bits of entropy. Generated values are never saved.</Label>}
      </View>}
  />;
}
