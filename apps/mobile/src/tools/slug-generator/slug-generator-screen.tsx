import { useMemo } from 'react';
import { View } from 'react-native';
import { DEFAULT_SLUG_OPTIONS, generateSlug, type SlugOptions } from '@dude/tool-engine/tools/slug-generator/slug-generate';
import { ErrorBanner, InputEditor, OptionsSheet, OutputViewer, ToolScreen, useToolPreference, type OptionSpec, type OptionValue, type OptionValues } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';

const TOOL_ID = 'slug-generator';

/** Web persists one `options` object under this key; the kit's per-option keys cannot express that, so this screen owns it. */
const OPTION_SPECS: readonly OptionSpec[] = [
  { kind: 'select', id: 'separator', label: 'Separator', default: '-', choices: [{ value: '-', label: 'Hyphen (-)' }, { value: '_', label: 'Underscore (_)' }] },
  { kind: 'switch', id: 'removeStopwords', label: 'Remove stopwords', default: false },
  { kind: 'number', id: 'maxLength', label: 'Max length (0 = no limit)', default: 0, min: 0, max: 500 },
];

const decodeOptions = (raw: unknown): SlugOptions | null => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<Record<keyof SlugOptions, unknown>>;
  return {
    separator: value.separator === '_' ? '_' : '-',
    removeStopwords: value.removeStopwords === true,
    maxLength: typeof value.maxLength === 'number' && Number.isFinite(value.maxLength) && value.maxLength > 0 ? Math.trunc(value.maxLength) : null,
  };
};

export default function SlugGeneratorScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [decoded, setOptions] = useToolPreference<SlugOptions>(TOOL_ID, 'options', DEFAULT_SLUG_OPTIONS, { decode: decodeOptions });
  // The decoded object is rebuilt on every render; keep one identity per value so the memo below only reruns on a real change.
  const signature = JSON.stringify(decoded);
  const options = useMemo(() => decoded, [signature]);
  const values = useMemo<OptionValues>(() => ({ separator: options.separator, removeStopwords: options.removeStopwords, maxLength: options.maxLength ?? 0 }), [options]);
  const onOption = (id: string, value: OptionValue) => {
    if (id === 'separator') setOptions({ ...options, separator: value === '_' ? '_' : '-' });
    else if (id === 'removeStopwords') setOptions({ ...options, removeStopwords: value === true });
    else if (id === 'maxLength') setOptions({ ...options, maxLength: typeof value === 'number' && value > 0 ? Math.trunc(value) : null });
  };
  const result = useMemo(() => {
    if (input === '') return null;
    try { return { ok: true as const, output: generateSlug(input, options) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'The slug could not be generated.' }; }
  }, [input, options]);

  return <ToolScreen
    input={<InputEditor value={input} onChangeText={text => update({ input: text })} label="Text" />}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet options={OPTION_SPECS} values={values} onChange={onOption} />
    </View>}
    output={result && !result.ok ? <ErrorBanner message={result.error} /> : <OutputViewer value={result?.ok ? result.output : ''} label="Slug" emptyText="Output appears here." />}
  />;
}
