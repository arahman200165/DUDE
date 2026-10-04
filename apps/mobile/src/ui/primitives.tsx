import { useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextInputProps, type TextProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkbench } from '../state/workbench-provider';
import type { ActionResult } from '../state/workbench-model';

export function Label({ muted, mono, ...props }: TextProps & { readonly muted?: boolean; readonly mono?: boolean }) {
  const { theme } = useWorkbench();
  return <Text {...props} allowFontScaling style={[{ color: muted ? theme.colors.textMuted : theme.colors.text, fontSize: mono ? theme.metrics.textMono : theme.metrics.textUi, fontFamily: mono ? theme.fonts.monoFamily : theme.fonts.uiFamily }, props.style]} />;
}
export function Screen({ children }: PropsWithChildren) {
  const { theme } = useWorkbench();
  const insets = useSafeAreaInsets();
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ padding: theme.metrics.spacePanel, paddingBottom: theme.metrics.spacePanel + insets.bottom, gap: theme.metrics.spaceMajor }} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Section({ title, children }: PropsWithChildren<{ readonly title: string }>) {
  const { theme } = useWorkbench();
  return <View style={{ gap: theme.metrics.spaceNormal }}><Label accessibilityRole="header" style={{ fontWeight: '700' }}>{title}</Label>{children}</View>;
}
export function Button({ title, onPress, disabled, selected, hint }: {
  readonly title: string; readonly onPress: () => void; readonly disabled?: boolean; readonly selected?: boolean; readonly hint?: string;
}) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => ({
    minHeight: theme.metrics.touchMin, minWidth: theme.metrics.touchMin, justifyContent: 'center', paddingHorizontal: theme.metrics.spacePanel, paddingVertical: theme.metrics.spaceNormal,
    borderRadius: theme.metrics.radius, borderWidth: focused ? theme.metrics.focusWidth : 1, borderColor: focused || selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.accent : pressed ? theme.colors.panelElevated : theme.colors.panel,
  })}><Label style={{ color: selected ? theme.colors.onAccent : disabled ? theme.colors.textMuted : theme.colors.text, fontWeight: selected ? '700' : '500' }}>{title}</Label></Pressable>;
}
export function ActionButton({ title, onPress, disabled, selected }: { readonly title: string; readonly disabled?: boolean; readonly selected?: boolean; readonly onPress: () => Promise<ActionResult> }) {
  const { theme } = useWorkbench();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true); setError(undefined);
    try { const result = await onPress(); if (!result.ok) setError(result.reason); }
    catch { setError('The action could not be completed. Try again.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: theme.metrics.spaceMicro }}>
    <Button title={busy ? `${title}…` : title} disabled={disabled || busy} selected={selected} onPress={() => { void run(); }} />
    {busy && !theme.reducedMotion && <ActivityIndicator accessibilityLabel="Working" color={theme.colors.accent} />}
    {error && <Label accessibilityRole="alert" style={{ color: theme.status.error }}>! {error}</Label>}
  </View>;
}
export function Field({ label, ...props }: TextInputProps & { readonly label: string }) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: theme.metrics.spaceMicro }}><Label>{label}</Label><TextInput {...props} accessibilityLabel={label} allowFontScaling placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent} onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }} style={[{
    color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
    borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.controlHeight,
    padding: theme.metrics.spaceNormal, fontSize: theme.metrics.textUi, fontFamily: theme.fonts.uiFamily,
  }, props.style]} /></View>;
}
