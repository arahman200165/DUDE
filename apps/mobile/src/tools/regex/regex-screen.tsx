import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { explainRegex } from '@dude/tool-engine/tools/regex/regex-explain';
import { flavorNotesFor, REGEX_FLAVORS, type RegexFlavor } from '@dude/tool-engine/tools/regex/regex-flavor-notes';
import { ErrorBanner, InputEditor, ModeSegment, OutputViewer, ResultCard, ToolScreen, hapticSelection, useToolPreference } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';
import { Button, Field, Label } from '../../ui/primitives';
import {
  decodeFlags, FLAG_CHARS, matchCountLabel, MAX_PATTERN_LENGTH, MAX_RENDERED_MATCHES, MAX_TEXT_LENGTH, runRegex, toggleFlag,
  type RegexMobileOutcome, type RegexMobileRequest,
} from './regex-mobile';

const TOOL_ID = 'regex';
const RUN_DELAY_MS = 200;
const FLAVOR_PREFIX = 'flavor-';
const MODES = [{ id: 'match', label: 'Match' }, { id: 'replace', label: 'Replace' }];
const FLAVORS = (Object.entries(REGEX_FLAVORS) as [RegexFlavor, string][]).map(([id, label]) => ({ id: FLAVOR_PREFIX + id, label }));

type RegexMode = 'match' | 'replace';

/**
 * Preference keys follow the web tool: `flags`, `mode` and `flavor` are persisted; `pattern`, `testText` and `replacement` are session
 * input (in memory only, never synced). Matching runs on the JS thread (web uses a worker), so the input caps in `regex-mobile.ts`
 * and its nested-quantifier guard bound the work. The AI generate/explain features (desktop LLM bridge) are not part of Android.
 */
export default function RegexScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { pattern: '', testText: '', replacement: '' });
  const pattern = typeof stored.pattern === 'string' ? stored.pattern : '';
  const testText = typeof stored.testText === 'string' ? stored.testText : '';
  const replacement = typeof stored.replacement === 'string' ? stored.replacement : '';
  const [flags, setFlags] = useToolPreference<string>(TOOL_ID, 'flags', 'g', { decode: decodeFlags });
  const [mode, setMode] = useToolPreference<RegexMode>(TOOL_ID, 'mode', 'match', { decode: raw => raw === 'match' || raw === 'replace' ? raw : null });
  const [flavor, setFlavor] = useToolPreference<RegexFlavor>(TOOL_ID, 'flavor', 'js', { decode: raw => typeof raw === 'string' && raw in REGEX_FLAVORS ? raw as RegexFlavor : null });
  const [showExplain, setShowExplain] = useState(false);
  const [allowRisky, setAllowRisky] = useState(false);
  const [outcome, setOutcome] = useState<RegexMobileOutcome>({ status: 'idle' });

  // A different pattern needs its own "run anyway" decision.
  useEffect(() => { setAllowRisky(false); }, [pattern]);

  useEffect(() => {
    const request: RegexMobileRequest = mode === 'replace'
      ? { kind: 'replace', pattern, flags, text: testText, replacement }
      : { kind: 'match', pattern, flags, text: testText };
    const timer = setTimeout(() => setOutcome(runRegex(request, { allowRisky })), RUN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pattern, flags, testText, replacement, mode, allowRisky]);

  const explanation = useMemo(() => showExplain && pattern !== '' ? explainRegex(pattern, flags) : null, [showExplain, pattern, flags]);
  const notes = useMemo(() => flavorNotesFor(pattern, flags, flavor), [pattern, flags, flavor]);

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <Field testID="tool-input-pattern" label="Pattern" value={pattern} onChangeText={text => update({ pattern: text })} placeholder="pattern" maxLength={MAX_PATTERN_LENGTH}
        autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" style={{ fontFamily: theme.fonts.monoFamily, fontSize: theme.metrics.textMono }} />
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label style={{ fontWeight: '700' }}>Flags</Label>
        <View accessibilityLabel="Flags" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceMicro }}>
          {FLAG_CHARS.map(flag => <FlagChip key={flag} flag={flag} on={flags.includes(flag)} onPress={() => setFlags(toggleFlag(flags, flag))} />)}
        </View>
      </View>
      <InputEditor name="text" label="Test text" value={testText} onChangeText={text => update({ testText: text })} placeholder="Test text" />
      <Label muted>Android limits the test text to {MAX_TEXT_LENGTH / 1024} KiB.</Label>
    </View>}
    options={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment label="Mode" modes={MODES} value={mode} onChange={next => setMode(next as RegexMode)} />
      {mode === 'replace' && <Field testID="tool-input-replacement" label="Replacement (supports $1, $<name>, $&, $$)" value={replacement} onChangeText={text => update({ replacement: text })}
        maxLength={2_000} autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" style={{ fontFamily: theme.fonts.monoFamily, fontSize: theme.metrics.textMono }} />}
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label style={{ fontWeight: '700' }}>Flavor notes</Label>
        <ModeSegment label="Flavor" modes={FLAVORS} value={FLAVOR_PREFIX + flavor} onChange={next => setFlavor(next.slice(FLAVOR_PREFIX.length) as RegexFlavor)} />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Button testID="regex-explain-toggle" title={showExplain ? 'Hide explanation' : 'Explain'} selected={showExplain} hint="Shows a plain-English breakdown of the pattern" onPress={() => setShowExplain(!showExplain)} />
      </View>
    </View>}
    output={<View style={{ gap: theme.metrics.spaceMajor }}>
      <Outcome outcome={outcome} onRunAnyway={() => setAllowRisky(true)} />
      {explanation && (explanation.ok
        ? <ResultCard title="Explanation">{explanation.lines.map((line, index) => <Text key={index} testID={`explain-line-${index}`} selectable allowFontScaling style={{
          paddingLeft: line.depth * theme.metrics.spaceMajor, color: theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily,
        }}>{line.text}</Text>)}</ResultCard>
        : <ErrorBanner message={explanation.error} />)}
      {notes.length > 0 && <ResultCard title="Flavor notes">{notes.map(note => <Label key={note.id} style={{ color: note.severity === 'warning' ? theme.status.warning : theme.colors.textMuted }}>
        <Text style={{ fontWeight: '700' }}>{note.severity === 'warning' ? '! ' : ''}{note.title}: </Text>{note.detail}
      </Label>)}</ResultCard>}
    </View>}
  />;
}

function FlagChip({ flag, on, onPress }: { readonly flag: string; readonly on: boolean; readonly onPress: () => void }) {
  const { theme } = useWorkbench();
  return <Pressable testID={`option-flag-${flag}`} accessibilityRole="checkbox" accessibilityLabel={`Flag ${flag}`} accessibilityState={{ checked: on }}
    onPress={() => { onPress(); void hapticSelection(); }}
    style={{
      minHeight: theme.metrics.touchMin, minWidth: theme.metrics.touchMin, alignItems: 'center', justifyContent: 'center', borderRadius: theme.metrics.radius, borderWidth: 1,
      borderColor: on ? theme.colors.accent : theme.colors.border, backgroundColor: on ? theme.colors.accent : theme.colors.panel,
    }}>
    <Label mono style={{ color: on ? theme.colors.onAccent : theme.colors.text, fontWeight: on ? '700' : '500' }}>{flag}</Label>
  </Pressable>;
}

function CountPill({ label }: { readonly label: string }) {
  const { theme } = useWorkbench();
  return <View style={{
    alignSelf: 'flex-start', paddingHorizontal: theme.metrics.spaceNormal, paddingVertical: theme.metrics.spaceMicro, borderRadius: theme.metrics.radius * 4,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.panel,
  }}>
    <Text testID="match-count" allowFontScaling style={{ color: theme.colors.text, fontSize: theme.metrics.textUiSm, fontFamily: theme.fonts.uiFamily, fontWeight: '700' }}>{label}</Text>
  </View>;
}

function Outcome({ outcome, onRunAnyway }: { readonly outcome: RegexMobileOutcome; readonly onRunAnyway: () => void }) {
  const { theme } = useWorkbench();
  switch (outcome.status) {
    case 'idle': return <Label muted>Enter a pattern to see matches.</Label>;
    case 'error': return <ErrorBanner message={outcome.error} />;
    case 'guarded': return <ResultCard title="Pattern not run" tone="warning">
      <Label testID="regex-guard">{outcome.reason}</Label>
      <View style={{ flexDirection: 'row' }}><Button testID="regex-run-anyway" title="Run anyway" hint="Runs the pattern even though it may freeze the app" onPress={onRunAnyway} /></View>
    </ResultCard>;
    case 'replaced': return <OutputViewer value={outcome.output} label="Replaced text" emptyText="The result is empty." />;
    case 'matches': return <View style={{ gap: theme.metrics.spaceNormal }}>
      <CountPill label={matchCountLabel(outcome.total)} />
      {outcome.total === 0 && <Label muted>No matches.</Label>}
      {outcome.matches.map((entry, index) => <View key={index} style={{
        gap: theme.metrics.spaceMicro, padding: theme.metrics.spaceNormal, backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.metrics.spaceNormal }}>
          <Text testID={`match-${index + 1}`} selectable allowFontScaling style={{ flex: 1, color: theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{entry.match || '(empty match)'}</Text>
          <Text testID={`match-${index + 1}-index`} allowFontScaling style={{ color: theme.colors.textMuted, fontSize: theme.metrics.textUiSm, fontFamily: theme.fonts.uiFamily }}>at {entry.index}</Text>
        </View>
        {entry.groups.map((group, groupIndex) => <Text key={groupIndex} testID={`match-${index + 1}-group-${group.name ?? group.index}`} selectable allowFontScaling style={{
          color: theme.colors.textMuted, fontSize: theme.metrics.textUiSm, fontFamily: theme.fonts.monoFamily,
        }}>{group.name ?? `group ${group.index}`}: {group.value ?? '(undefined)'}</Text>)}
      </View>)}
      {outcome.truncated && <Label muted>Showing the first {MAX_RENDERED_MATCHES} of {outcome.total} matches.</Label>}
    </View>;
  }
}
