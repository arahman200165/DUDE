import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';

/**
 * Single-line masked field for secrets: hidden by default, no autofill or suggestions, a Show/Hide toggle and Clear.
 * testIDs: `<testID>`, `<testID>-toggle`, `<testID>-clear`. The caller owns the value; this keeps no copy.
 */
export function SecretField({ label, value, onChangeText, testID, show, onToggleShow }: {
  readonly label: string; readonly value: string; readonly onChangeText: (text: string) => void; readonly testID: string;
  readonly show: boolean; readonly onToggleShow: () => void;
}) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Label accessibilityRole="header" style={{ fontWeight: '700' }}>{label}</Label>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChangeText} secureTextEntry={!show}
      autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" allowFontScaling
      placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
        borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.controlHeight,
        paddingHorizontal: theme.metrics.spaceNormal, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily,
      }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID={`${testID}-toggle`} title={show ? 'Hide' : 'Show'} accessibilityLabel={show ? `Hide ${label}` : `Show ${label}`} onPress={onToggleShow} />
      <Button testID={`${testID}-clear`} title="Clear" disabled={!value} onPress={() => onChangeText('')} />
    </View>
  </View>;
}
