import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStatus } from '@dude/domain/core/appearance/native-theme';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label } from '../ui/primitives';
import { hapticSelection, hapticSuccess, readClipboard, writeClipboard } from './feedback';
import { SaveOutputButton } from './file-actions';
import { defaultOutputName } from './file-io-core';
import type { KeyValueRow } from './text-tool-controller';

/** Transient screen-reader announcement (TalkBack). Never throws. */
export function announce(message: string): void {
  try { AccessibilityInfo.announceForAccessibility(message); } catch { /* announcements are best effort */ }
}

/** Characters rendered in an OutputViewer. Copy and Share always use the full text. */
export const OUTPUT_DISPLAY_LIMIT = 100_000;

const suffix = (name?: string): string => name ? `-${name}` : '';

/**
 * Column layout for a tool: input, options and output slots. The host (`app/tools/[id]`) already scrolls and keeps taps
 * through the keyboard, so this is a plain column by default (a nested vertical ScrollView would fight it). `standalone`
 * adds its own keyboard-aware scroll for use outside the host.
 */
export function ToolScreen({ input, options, output, children, standalone }: {
  readonly input?: ReactNode; readonly options?: ReactNode; readonly output?: ReactNode; readonly children?: ReactNode; readonly standalone?: boolean;
}) {
  const { theme } = useWorkbench();
  const insets = useSafeAreaInsets();
  const column = <View style={{ gap: theme.metrics.spaceMajor }}>{input}{options}{children}{output}</View>;
  if (!standalone) return column;
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: theme.metrics.spacePanel, paddingBottom: theme.metrics.spacePanel + insets.bottom }}>{column}</ScrollView>
  </KeyboardAvoidingView>;
}

/** Multiline monospace input with Paste (clipboard is read only on tap), Clear and optional Swap. */
export function InputEditor({ value, onChangeText, name, label = 'Input', placeholder, onSwap, swapDisabled, extraActions }: {
  readonly value: string; readonly onChangeText: (text: string) => void; readonly name?: string; readonly label?: string;
  readonly placeholder?: string; readonly onSwap?: () => void; readonly swapDisabled?: boolean; readonly extraActions?: ReactNode;
}) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  const paste = async () => {
    const text = await readClipboard();
    if (!text) { announce('Clipboard is empty'); return; }
    onChangeText(text);
    void hapticSelection();
  };
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{label}</Label>
    <TextInput testID={`tool-input${suffix(name)}`} accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} multiline
      autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" allowFontScaling textAlignVertical="top"
      placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
        borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.controlHeight * 3,
        padding: theme.metrics.spaceNormal, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily,
      }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID={`tool-input${suffix(name)}-paste`} title="Paste" hint="Pastes the clipboard text into the input" onPress={() => { void paste(); }} />
      <Button testID={`tool-input${suffix(name)}-clear`} title="Clear" disabled={!value} onPress={() => { onChangeText(''); void hapticSelection(); }} />
      {onSwap && <Button testID={`tool-input${suffix(name)}-swap`} title="Swap" hint="Moves the output into the input" disabled={swapDisabled} onPress={onSwap} />}
      {extraActions}
    </View>
  </View>;
}

/** Selectable monospace output with Copy (haptic and "Copied" announcement), Share and an `extraActions` slot (Save to file). */
export function OutputViewer({ value, name, label = 'Output', emptyText = 'Nothing to show yet.', extraActions, shareTitle, saveName, toolId }: {
  readonly value: string; readonly name?: string; readonly label?: string; readonly emptyText?: string; readonly extraActions?: ReactNode; readonly shareTitle?: string;
  /** Suggested file name for Save. Defaults to `<toolId>-output.txt` when `toolId` is given; with neither, Save is hidden. */
  readonly saveName?: string; readonly toolId?: string;
}) {
  const { theme } = useWorkbench();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const empty = value === '';
  const shown = value.length > OUTPUT_DISPLAY_LIMIT ? value.slice(0, OUTPUT_DISPLAY_LIMIT) : value;
  const copy = async () => {
    if (!await writeClipboard(value)) { announce('Copy failed'); return; }
    void hapticSuccess();
    announce('Copied');
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  const share = async () => {
    try { await Share.share({ message: value, title: shareTitle }); } catch { announce('Share failed'); }
  };
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{label}</Label>
    <View style={{ backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius, padding: theme.metrics.spaceNormal, minHeight: theme.metrics.controlHeight }}>
      <Text testID={`tool-output${suffix(name)}`} selectable allowFontScaling accessibilityLabel={empty ? `${label}: empty` : undefined}
        style={{ color: empty ? theme.colors.textMuted : theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{empty ? emptyText : shown}</Text>
    </View>
    {shown.length < value.length && <Label muted>Showing the first {OUTPUT_DISPLAY_LIMIT.toLocaleString('en-US')} of {value.length.toLocaleString('en-US')} characters. Copy and Share use the full output.</Label>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <Button testID={`tool-output${suffix(name)}-copy`} title="Copy" disabled={empty} onPress={() => { void copy(); }} />
      <Button testID={`tool-output${suffix(name)}-share`} title="Share" disabled={empty} onPress={() => { void share(); }} />
      {(saveName || toolId) && <SaveOutputButton name={name} text={value} fileName={saveName ?? defaultOutputName(toolId!)} disabled={empty} />}
      {extraActions}
      {copied && <Label testID={`tool-output${suffix(name)}-copied`} accessibilityLiveRegion="polite" muted>Copied</Label>}
    </View>
  </View>;
}

/** Segmented control. Items wrap instead of truncating, so large font scales stay usable. */
export function ModeSegment({ modes, value, onChange, label = 'Mode' }: {
  readonly modes: readonly { readonly id: string; readonly label: string }[]; readonly value: string; readonly onChange: (id: string) => void; readonly label?: string;
}) {
  const { theme } = useWorkbench();
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceMicro }}>
    {modes.map(mode => {
      const selected = mode.id === value;
      return <Pressable key={mode.id} testID={`mode-${mode.id}`} accessibilityRole="radio" accessibilityLabel={mode.label} accessibilityState={{ checked: selected, selected }}
        onPress={() => { if (!selected) { onChange(mode.id); void hapticSelection(); } }}
        style={{
          flexGrow: 1, minHeight: theme.metrics.touchMin, minWidth: theme.metrics.touchMin, alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: theme.metrics.spacePanel, paddingVertical: theme.metrics.spaceNormal, borderRadius: theme.metrics.radius,
          borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accent : theme.colors.panel,
        }}>
        <Label style={{ color: selected ? theme.colors.onAccent : theme.colors.text, fontWeight: selected ? '700' : '500', textAlign: 'center' }}>{mode.label}</Label>
      </Pressable>;
    })}
  </View>;
}

export function ResultCard({ title, children, tone }: { readonly title?: string; readonly children: ReactNode; readonly tone?: NativeStatus }) {
  const { theme } = useWorkbench();
  return <View style={{ gap: theme.metrics.spaceNormal, padding: theme.metrics.spacePanel, backgroundColor: theme.colors.panel, borderRadius: theme.metrics.radius, borderWidth: 1, borderColor: tone ? theme.status[tone] : theme.colors.border }}>
    {title && <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{title}</Label>}
    {children}
  </View>;
}

/** Labelled rows with a per-row Copy. `testID`s: `kv-<key>` (row), `kv-<key>-value`, `kv-<key>-copy`. */
export function KeyValueList({ rows, emptyText = 'No values.' }: { readonly rows: readonly KeyValueRow[]; readonly emptyText?: string }) {
  const { theme } = useWorkbench();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async (row: KeyValueRow) => {
    if (!await writeClipboard(row.value)) { announce('Copy failed'); return; }
    void hapticSuccess();
    announce(`Copied ${row.label}`);
    setCopiedKey(row.key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopiedKey(null), 2000);
  };
  if (!rows.length) return <Label muted>{emptyText}</Label>;
  return <View style={{ backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius }}>
    {rows.map((row, index) => <View key={row.key} testID={`kv-${row.key}`} style={{
      flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal, padding: theme.metrics.spaceNormal, minHeight: theme.metrics.rowHeight,
      borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.border,
    }}>
      <View style={{ flex: 1, gap: theme.metrics.spaceMicro }}>
        <Label muted style={{ fontSize: theme.metrics.textUiSm }}>{row.label}</Label>
        <Text testID={`kv-${row.key}-value`} selectable allowFontScaling style={{ color: theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{row.value}</Text>
      </View>
      <Button testID={`kv-${row.key}-copy`} title={copiedKey === row.key ? 'Copied' : 'Copy'} hint={`Copies ${row.label}`} onPress={() => { void copy(row); }} />
    </View>)}
  </View>;
}

/** Error with a non-color cue: the glyph and the "Error:" prefix carry the meaning as well as the status color. */
export function ErrorBanner({ message }: { readonly message: string }) {
  const { theme } = useWorkbench();
  return <View testID="tool-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{
    flexDirection: 'row', gap: theme.metrics.spaceNormal, padding: theme.metrics.spaceNormal, backgroundColor: theme.colors.panel,
    borderRadius: theme.metrics.radius, borderWidth: 1, borderColor: theme.status.error, minHeight: theme.metrics.touchMin,
  }}>
    <Label style={{ color: theme.status.error, fontWeight: '700' }}>⚠</Label>
    <Label style={{ flex: 1, color: theme.status.error }}><Text style={{ fontWeight: '700' }}>Error: </Text>{message}</Label>
  </View>;
}

const GLYPH: Readonly<Record<NativeStatus, string>> = { error: '✕', warning: '!', success: '✓', info: 'i', busy: '…', offline: '○' };
export function StatusPill({ label, tone = 'info', testID }: { readonly label: string; readonly tone?: NativeStatus; readonly testID?: string }) {
  const { theme } = useWorkbench();
  return <View testID={testID} accessible accessibilityLabel={`${tone}: ${label}`} style={{
    alignSelf: 'flex-start', flexDirection: 'row', gap: theme.metrics.spaceMicro, paddingHorizontal: theme.metrics.spaceNormal, paddingVertical: theme.metrics.spaceMicro,
    borderRadius: theme.metrics.radius * 4, borderWidth: 1, borderColor: theme.status[tone], backgroundColor: theme.colors.panel,
  }}>
    <Label style={{ color: theme.status[tone], fontWeight: '700', fontSize: theme.metrics.textUiSm }}>{GLYPH[tone]}</Label>
    <Label style={{ color: theme.status[tone], fontSize: theme.metrics.textUiSm }}>{label}</Label>
  </View>;
}
