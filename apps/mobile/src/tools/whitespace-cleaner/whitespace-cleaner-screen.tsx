import { useMemo } from 'react';
import { View } from 'react-native';
import {
  DEFAULT_WHITESPACE_OPTIONS, cleanWhitespace, migrateWhitespaceOptions, type IndentStyle, type LineEnding, type TabConversion, type WhitespaceCleanOptions,
} from '@dude/tool-engine/tools/whitespace-cleaner/whitespace-clean';
import { checkInputBudget, DEFAULT_MAIN_THREAD_INPUT_BYTES, ErrorBanner, InputEditor, OptionsSheet, OutputViewer, ToolScreen, useCrossingHaptic, useToolPreference, type OptionSpec, type OptionValue, type OptionValues } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';

const TOOL_ID = 'whitespace-cleaner';
const D = DEFAULT_WHITESPACE_OPTIONS;

/** Web persists one `options` object under this key; the kit's per-option keys cannot express that, so this screen owns it. */
const OPTION_SPECS: readonly OptionSpec[] = [
  { kind: 'switch', id: 'trim', label: 'Trim the whole text', default: D.trim },
  { kind: 'switch', id: 'collapseSpaces', label: 'Collapse repeated spaces', default: D.collapseSpaces },
  { kind: 'switch', id: 'stripTrailingWhitespace', label: 'Strip trailing whitespace', default: D.stripTrailingWhitespace },
  { kind: 'switch', id: 'removeBlankLines', label: 'Remove blank lines', default: D.removeBlankLines },
  { kind: 'switch', id: 'stripInvisibleChars', label: 'Strip invisible characters', default: D.stripInvisibleChars },
  { kind: 'select', id: 'lineEnding', label: 'Line endings', default: D.lineEnding, choices: [
    { value: 'unchanged', label: 'Unchanged' }, { value: 'lf', label: 'LF' }, { value: 'crlf', label: 'CRLF' }, { value: 'cr', label: 'CR' },
  ] },
  { kind: 'select', id: 'tabConversion', label: 'Tabs and spaces', default: D.tabConversion, choices: [
    { value: 'none', label: 'None' }, { value: 'tabs-to-spaces', label: 'Tabs to spaces' }, { value: 'spaces-to-tabs', label: 'Spaces to tabs' },
  ] },
  { kind: 'number', id: 'tabWidth', label: 'Tab width', default: D.tabWidth, min: 1, max: 16 },
  { kind: 'switch', id: 'reindent', label: 'Re-indent', default: D.reindent },
  { kind: 'number', id: 'reindentFromWidth', label: 'Re-indent from width', default: D.reindentFromWidth, min: 1, max: 16 },
  { kind: 'number', id: 'reindentToWidth', label: 'Re-indent to width', default: D.reindentToWidth, min: 1, max: 16 },
  { kind: 'select', id: 'reindentToStyle', label: 'Re-indent to', default: D.reindentToStyle, choices: [{ value: 'spaces', label: 'Spaces' }, { value: 'tabs', label: 'Tabs' }] },
];

const oneOf = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T => (allowed as readonly unknown[]).includes(raw) ? raw as T : fallback;
const width = (raw: unknown, fallback: number): number => typeof raw === 'number' && Number.isFinite(raw) ? Math.min(16, Math.max(1, Math.trunc(raw))) : fallback;
const flag = (raw: unknown, fallback: boolean): boolean => typeof raw === 'boolean' ? raw : fallback;

/** Applies the web migration (legacy `normalizeLineEndings`), then validates every field so a foreign value cannot reach the engine. */
const decodeOptions = (raw: unknown): WhitespaceCleanOptions | null => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = migrateWhitespaceOptions(raw) as unknown as Record<keyof WhitespaceCleanOptions, unknown>;
  return {
    trim: flag(m.trim, D.trim),
    collapseSpaces: flag(m.collapseSpaces, D.collapseSpaces),
    lineEnding: oneOf<LineEnding>(m.lineEnding, ['unchanged', 'lf', 'crlf', 'cr'], D.lineEnding),
    stripTrailingWhitespace: flag(m.stripTrailingWhitespace, D.stripTrailingWhitespace),
    removeBlankLines: flag(m.removeBlankLines, D.removeBlankLines),
    stripInvisibleChars: flag(m.stripInvisibleChars, D.stripInvisibleChars),
    tabConversion: oneOf<TabConversion>(m.tabConversion, ['none', 'tabs-to-spaces', 'spaces-to-tabs'], D.tabConversion),
    tabWidth: width(m.tabWidth, D.tabWidth),
    reindent: flag(m.reindent, D.reindent),
    reindentFromWidth: width(m.reindentFromWidth, D.reindentFromWidth),
    reindentToWidth: width(m.reindentToWidth, D.reindentToWidth),
    reindentToStyle: oneOf<IndentStyle>(m.reindentToStyle, ['spaces', 'tabs'], D.reindentToStyle),
  };
};

export default function WhitespaceCleanerScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const [decoded, setOptions] = useToolPreference<WhitespaceCleanOptions>(TOOL_ID, 'options', D, { decode: decodeOptions });
  // The decoded object is rebuilt on every render; keep one identity per value so the memo below only reruns on a real change.
  const signature = JSON.stringify(decoded);
  const options = useMemo(() => decoded, [signature]);
  const values = options as unknown as OptionValues;
  const onOption = (id: string, value: OptionValue) => {
    const next = decodeOptions({ ...options, [id]: value });
    if (next) setOptions(next);
  };
  const tooLarge = useMemo(() => checkInputBudget(input, DEFAULT_MAIN_THREAD_INPUT_BYTES), [input]);
  useCrossingHaptic(tooLarge !== null);
  const result = useMemo(() => {
    if (input === '') return null;
    if (tooLarge !== null) return { ok: false as const, error: tooLarge };
    try { return { ok: true as const, output: cleanWhitespace(input, options) }; }
    catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'The text could not be cleaned.' }; }
  }, [input, options, tooLarge]);

  return <ToolScreen
    input={<InputEditor value={input} onChangeText={text => update({ input: text })} label="Text" />}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet options={OPTION_SPECS} values={values} onChange={onOption} />
    </View>}
    output={result && !result.ok ? <ErrorBanner message={result.error} /> : <OutputViewer value={result?.ok ? result.output : ''} label="Cleaned text" emptyText="Output appears here." />}
  />;
}
