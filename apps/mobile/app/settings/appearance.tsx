import { View } from 'react-native';
import { APPEARANCE_AXES, type AppearancePrefs, type FontChoice } from '@dude/domain/core/appearance/appearance.model';
import { useWorkbench } from '../../src/state/workbench-provider';
import { ActionButton, Label, Screen, Section } from '../../src/ui/primitives';

const axisTitles: Readonly<Record<string, string>> = {
  theme: 'Theme', contrast: 'Contrast', accent: 'Accent', catset: 'Category palette', semantic: 'Status colors', density: 'Density',
  uiSize: 'UI text size', monoSize: 'Code text size', ligatures: 'Code ligatures', motion: 'Motion',
};
const fontLabel = (choice: FontChoice) => typeof choice === 'string' ? choice : choice.custom;

export default function AppearanceScreen() {
  const { snapshot, actions, theme } = useWorkbench();
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
    </Section>
  </Screen>;
}
