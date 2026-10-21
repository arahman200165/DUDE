import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label } from '../ui/primitives';
import { hapticSelection } from './feedback';
import type { OptionSpec, OptionValue, OptionValues } from './text-tool-controller';

/** Opens a bottom sheet (RN Modal + backdrop, no sheet library) with one control per option. testIDs: `tool-options`, `option-<id>`. */
export function OptionsSheet({ options, values, onChange, title = 'Options' }: {
  readonly options: readonly OptionSpec[]; readonly values: OptionValues; readonly onChange: (id: string, value: OptionValue) => void; readonly title?: string;
}) {
  const { theme } = useWorkbench();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (!options.length) return null;
  const close = () => setOpen(false);
  return <>
    <Button testID="tool-options" title="Options" hint="Opens the options sheet" onPress={() => setOpen(true)} />
    <Modal visible={open} transparent animationType={theme.reducedMotion ? 'none' : 'slide'} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable testID="tool-options-backdrop" accessibilityRole="button" accessibilityLabel="Close options" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.scrim }} />
        <View accessibilityViewIsModal style={{
          maxHeight: '85%', backgroundColor: theme.colors.panelElevated, borderTopLeftRadius: theme.metrics.radius * 2, borderTopRightRadius: theme.metrics.radius * 2,
          borderWidth: 1, borderColor: theme.colors.border, paddingBottom: insets.bottom,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.metrics.spaceNormal, padding: theme.metrics.spacePanel }}>
            <Label accessibilityRole="header" style={{ flex: 1, fontWeight: '700' }}>{title}</Label>
            <Button testID="tool-options-done" title="Done" onPress={close} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.metrics.spacePanel, paddingTop: 0, gap: theme.metrics.spaceMajor }}>
            {options.map(option => <OptionControl key={option.id} option={option} value={values[option.id] ?? option.default} onChange={value => onChange(option.id, value)} />)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

function OptionControl({ option, value, onChange }: { readonly option: OptionSpec; readonly value: OptionValue; readonly onChange: (value: OptionValue) => void }) {
  const { theme } = useWorkbench();
  switch (option.kind) {
    case 'switch': {
      const on = value === true;
      return <Pressable testID={`option-${option.id}`} accessibilityRole="switch" accessibilityLabel={option.label} accessibilityState={{ checked: on }}
        onPress={() => { onChange(!on); void hapticSelection(); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.metrics.spaceNormal, minHeight: theme.metrics.touchMin }}>
        <Label style={{ flex: 1 }}>{option.label}</Label>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Switch value={on} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={on ? theme.colors.onAccent : theme.colors.textMuted} />
        </View>
      </Pressable>;
    }
    case 'select':
      return <View testID={`option-${option.id}`} accessibilityRole="radiogroup" accessibilityLabel={option.label} style={{ gap: theme.metrics.spaceNormal }}>
        <Label>{option.label}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceMicro }}>
          {option.choices.map(choice => {
            const selected = choice.value === value;
            return <Pressable key={choice.value} testID={`option-${option.id}-${choice.value}`} accessibilityRole="radio" accessibilityLabel={choice.label} accessibilityState={{ checked: selected, selected }}
              onPress={() => { if (!selected) { onChange(choice.value); void hapticSelection(); } }}
              style={{
                minHeight: theme.metrics.touchMin, minWidth: theme.metrics.touchMin, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.metrics.spacePanel,
                borderRadius: theme.metrics.radius, borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? theme.colors.accent : theme.colors.panel,
              }}>
              <Label style={{ color: selected ? theme.colors.onAccent : theme.colors.text, fontWeight: selected ? '700' : '500', textAlign: 'center' }}>{choice.label}</Label>
            </Pressable>;
          })}
        </View>
      </View>;
    case 'number': return <NumberControl option={option} value={typeof value === 'number' ? value : option.default} onChange={onChange} />;
    case 'text': return <TextControl option={option} value={typeof value === 'string' ? value : option.default} onChange={onChange} />;
  }
}

function useFieldStyle() {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  return {
    focus: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
    style: {
      color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
      borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.controlHeight,
      paddingHorizontal: theme.metrics.spaceNormal, fontSize: theme.metrics.textUi, fontFamily: theme.fonts.uiFamily,
    },
  };
}

function TextControl({ option, value, onChange }: { readonly option: Extract<OptionSpec, { kind: 'text' }>; readonly value: string; readonly onChange: (value: string) => void }) {
  const { theme } = useWorkbench();
  const field = useFieldStyle();
  return <View style={{ gap: theme.metrics.spaceMicro }}>
    <Label>{option.label}</Label>
    <TextInput testID={`option-${option.id}`} accessibilityLabel={option.label} value={value} onChangeText={onChange} autoCorrect={false} autoCapitalize="none" spellCheck={false}
      allowFontScaling placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent} {...field.focus} style={field.style} />
  </View>;
}

/** A numeric field with -/+ steppers. The draft text may be mid-edit; only a valid, in-range number is committed. */
function NumberControl({ option, value, onChange }: { readonly option: Extract<OptionSpec, { kind: 'number' }>; readonly value: number; readonly onChange: (value: number) => void }) {
  const { theme } = useWorkbench();
  const field = useFieldStyle();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(current => Number(current) === value ? current : String(value)); }, [value]);
  const clamp = (next: number) => Math.min(option.max ?? Infinity, Math.max(option.min ?? -Infinity, next));
  const step = (delta: number) => { const next = clamp(value + delta); onChange(next); setDraft(String(next)); void hapticSelection(); };
  return <View style={{ gap: theme.metrics.spaceMicro }}>
    <Label>{option.label}</Label>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <Button testID={`option-${option.id}-dec`} title="−" hint={`Decrease ${option.label}`} disabled={option.min !== undefined && value <= option.min} onPress={() => step(-1)} />
      <TextInput testID={`option-${option.id}`} accessibilityLabel={option.label} value={draft} keyboardType="numeric" allowFontScaling selectionColor={theme.colors.accent} {...field.focus}
        onChangeText={text => { setDraft(text); const parsed = Number(text); if (text.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed)); }}
        onEndEditing={() => setDraft(String(value))} style={[field.style, { flex: 1, minWidth: theme.metrics.touchMin * 2, textAlign: 'center' }]} />
      <Button testID={`option-${option.id}-inc`} title="+" accessibilityLabel={`Increase ${option.label}`} disabled={option.max !== undefined && value >= option.max} onPress={() => step(1)} />
    </View>
  </View>;
}
