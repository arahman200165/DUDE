import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { announce, hapticSelection, readClipboard } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';

/**
 * Single-line color input with Paste and Clear, plus a small framed chip showing the parsed user color
 * (`previewColor`, null while the text is not a color). The chip fill is user content; its frame is a theme token.
 */
export function ColorField({ name, label, value, onChangeText, previewColor }: {
  readonly name: string; readonly label: string; readonly value: string; readonly onChangeText: (text: string) => void; readonly previewColor: string | null;
}) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  const paste = async () => {
    const text = await readClipboard();
    if (!text) { announce('Clipboard is empty'); return; }
    onChangeText(text.trim());
    void hapticSelection();
  };
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{label}</Label>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <View testID={`tool-input-${name}-chip`} accessible accessibilityLabel={previewColor ? `${label} preview` : `${label} is not a color`}
        style={{ width: theme.metrics.touchMin, height: theme.metrics.touchMin, borderRadius: theme.metrics.radius, borderWidth: 2, borderColor: theme.colors.border, padding: theme.metrics.spaceMicro, backgroundColor: theme.colors.panel, justifyContent: 'center', alignItems: 'center' }}>
        {previewColor
          ? <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: theme.metrics.radius, backgroundColor: previewColor }} />
          : <Label muted>?</Label>}
      </View>
      <TextInput testID={`tool-input-${name}`} accessibilityLabel={label} value={value} onChangeText={onChangeText}
        autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" allowFontScaling
        placeholder="#rrggbb, rgb(), hsl(), name" placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          flex: 1, color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
          borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.touchMin,
          padding: theme.metrics.spaceNormal, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily,
        }} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID={`tool-input-${name}-paste`} title="Paste" hint={`Pastes the clipboard text into ${label}`} onPress={() => { void paste(); }} />
      <Button testID={`tool-input-${name}-clear`} title="Clear" disabled={!value} onPress={() => { onChangeText(''); void hapticSelection(); }} />
    </View>
  </View>;
}
