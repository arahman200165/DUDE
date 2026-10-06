import { View } from 'react-native';
import { useState } from 'react';
import { APPEARANCE_AXES, UI_FONTS, MONO_FONTS, sanitizeFontFamily, type AppearancePrefs, type FontChoice } from '@dude/domain/core/appearance/appearance.model';
import { useWorkbench } from '../../src/state/workbench-provider';
import { ActionButton, Field, Label, Screen, Section } from '../../src/ui/primitives';

const axisTitles: Readonly<Record<string, string>> = {
  theme: 'Theme', contrast: 'Contrast', accent: 'Accent', catset: 'Category palette', semantic: 'Status colors', density: 'Density',
  uiSize: 'UI text size', monoSize: 'Code text size', ligatures: 'Code ligatures', motion: 'Motion',
};
const fontLabel = (choice: FontChoice) => typeof choice === 'string' ? choice : choice.custom;

export default function AppearanceScreen() {
  const { snapshot, actions, theme } = useWorkbench();
  const [customUi, setCustomUi] = useState('');
  const [customMono, setCustomMono] = useState('');
  return <Screen>
    <Label muted>Shared appearance preferences. Android retains native touch targets and system font scaling.</Label>
    {Object.entries(APPEARANCE_AXES).map(([axisName, axis]) => {
      const key = (axisName === 'theme' ? 'mode' : axisName) as keyof AppearancePrefs;
      const current = theme.prefs[key];
      const system = axisName === 'theme' || axisName === 'contrast' || axisName === 'motion';
      const values = system ? [...axis.values, 'system'] : axis.values;
      return <Section key={axisName} title={axisTitles[axisName] ?? axisName}>
        <Label muted>Selected: {typeof current === 'string' ? axis.labels?.[current] ?? current : fontLabel(current)}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>{values.map(value => <ActionButton key={value} title={`${current === value ? '✓ ' : ''}${value === 'system' ? 'System' : axis.labels?.[value] ?? value}`} selected={current === value} disabled={!snapshot.capabilities.appearance} onPress={() => actions.patchAppearance({ [key]: value })} />)}</View>
        {axisName === 'ligatures' && <Label muted>Retained for compatible clients. Android uses its native monospace font.</Label>}
      </Section>;
    })}
    <Section title="Fonts on Android">
      <Label>UI: system font · Code: native monospace</Label>
      <Label muted>Desktop UI choice: {fontLabel(theme.prefs.uiFont)}</Label>
      <Label muted>Desktop code choice: {fontLabel(theme.prefs.monoFont)}</Label>
      <Label muted>Your stored font choices are preserved. Android uses native fallbacks.</Label>
      {([['uiFont', UI_FONTS, customUi, setCustomUi], ['monoFont', MONO_FONTS, customMono, setCustomMono]] as const).map(([key, options, custom, setCustom]) => <View key={key} style={{ gap: theme.metrics.spaceNormal }}>
        <Label>{key === 'uiFont' ? 'Shared UI font' : 'Shared code font'}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>{options.map(font => <ActionButton key={font.id} title={font.label} selected={theme.prefs[key] === font.id} disabled={!snapshot.capabilities.appearance} onPress={() => actions.patchAppearance({ [key]: font.id })} />)}</View>
        <Field label={key === 'uiFont' ? 'Custom UI font family' : 'Custom code font family'} value={custom} onChangeText={setCustom} maxLength={64} autoCapitalize="none" />
        <ActionButton title={key === 'uiFont' ? 'Save shared UI font' : 'Save shared code font'} disabled={!snapshot.capabilities.appearance || sanitizeFontFamily(custom) === null} onPress={() => actions.patchAppearance({ [key]: { custom: custom.trim() } })} />
      </View>)}
    </Section>
  </Screen>;
}
