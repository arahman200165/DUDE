import { Pressable, View } from 'react-native';
import { ErrorBanner, KeyValueList, ResultCard, ToolScreen, hapticSelection } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { useToolInput } from '../../tools-host/use-tool-input';
import { Field, Label } from '../../ui/primitives';
import {
  applyOctal, applySymbolic, CHMOD_BITS, CHMOD_SCOPES, CHMOD_SPECIALS, readChmodState, toggleBit, toggleSpecial,
  type ChmodScope, type ChmodSpecial, type ChmodState,
} from './chmod-converter-mobile';

const TOOL_ID = 'chmod-converter';
const SCOPE_LABEL: Readonly<Record<ChmodScope, string>> = { owner: 'Owner', group: 'Group', other: 'Other' };

/** Session input only (manifest preferences: none), like web: the whole octal/symbolic/permissions state lives in memory. */
export default function ChmodConverterScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, {} as { chmod?: unknown });
  const state = readChmodState(stored.chmod);
  const set = (next: ChmodState) => update({ chmod: next });
  const error = state.octalError || state.symbolicError;
  const fieldStyle = { fontFamily: theme.fonts.monoFamily, fontSize: theme.metrics.textMono };

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <Field testID="tool-input-octal" label="Octal (3 or 4 digits)" value={state.octal} onChangeText={text => set(applyOctal(state, text))} maxLength={4} keyboardType="number-pad"
        autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" style={fieldStyle} />
      <Field testID="tool-input-symbolic" label="Symbolic (e.g. rwxr-xr--)" value={state.symbolic} onChangeText={text => set(applySymbolic(state, text))} maxLength={10}
        autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" style={fieldStyle} />
    </View>}
    options={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ResultCard title="Permissions">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceMicro }}>
          <View style={{ flex: 1 }} />
          {CHMOD_BITS.map(({ letter, label }) => <View key={letter} style={{ width: theme.metrics.touchMin, alignItems: 'center' }}>
            <Label muted accessibilityLabel={label}>{letter}</Label>
          </View>)}
        </View>
        {CHMOD_SCOPES.map(scope => <View key={scope} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceMicro }}>
          <Label style={{ flex: 1, fontWeight: '700' }}>{SCOPE_LABEL[scope]}</Label>
          {CHMOD_BITS.map(({ bit, letter, label }) => <Cell key={bit} testID={`perm-${scope}-${letter}`} label={`${SCOPE_LABEL[scope]} ${label.toLowerCase()}`}
            on={state.permissions[scope][bit]} onPress={() => set(toggleBit(state, scope, bit))} />)}
        </View>)}
        <View style={{ gap: theme.metrics.spaceMicro, paddingTop: theme.metrics.spaceNormal }}>
          <Label style={{ fontWeight: '700' }}>Special bits</Label>
          {CHMOD_SPECIALS.map(kind => <SpecialRow key={kind} kind={kind} on={state.permissions.special[kind]} onPress={() => set(toggleSpecial(state, kind))} />)}
        </View>
      </ResultCard>
    </View>}
    output={error
      ? <ErrorBanner message={error} />
      : <KeyValueList rows={[
        { key: 'octal', label: 'Octal', value: state.octal },
        { key: 'symbolic', label: 'Symbolic', value: state.symbolic },
        { key: 'command', label: 'Command', value: `chmod ${state.octal} <file>` },
      ]} />}
  />;
}

/** A 48 dp switch cell; the check glyph, not only the fill color, shows the state. */
function Cell({ testID, label, on, onPress }: { readonly testID: string; readonly label: string; readonly on: boolean; readonly onPress: () => void }) {
  const { theme } = useWorkbench();
  return <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={() => { onPress(); void hapticSelection(); }}
    style={{ width: theme.metrics.touchMin, height: theme.metrics.touchMin, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: theme.metrics.touchMin * 0.7, height: theme.metrics.touchMin * 0.7, alignItems: 'center', justifyContent: 'center', borderRadius: theme.metrics.radius, borderWidth: 1,
      borderColor: on ? theme.colors.accent : theme.colors.border, backgroundColor: on ? theme.colors.accent : theme.colors.panel,
    }}>
      <Label style={{ color: on ? theme.colors.onAccent : theme.colors.textMuted, fontWeight: '700' }}>{on ? '✓' : ''}</Label>
    </View>
  </Pressable>;
}

function SpecialRow({ kind, on, onPress }: { readonly kind: ChmodSpecial; readonly on: boolean; readonly onPress: () => void }) {
  const { theme } = useWorkbench();
  return <Pressable testID={`perm-special-${kind}`} accessibilityRole="switch" accessibilityLabel={kind} accessibilityState={{ checked: on }} onPress={() => { onPress(); void hapticSelection(); }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal, minHeight: theme.metrics.touchMin }}>
    <View style={{
      width: theme.metrics.touchMin * 0.7, height: theme.metrics.touchMin * 0.7, alignItems: 'center', justifyContent: 'center', borderRadius: theme.metrics.radius, borderWidth: 1,
      borderColor: on ? theme.colors.accent : theme.colors.border, backgroundColor: on ? theme.colors.accent : theme.colors.panel,
    }}>
      <Label style={{ color: on ? theme.colors.onAccent : theme.colors.textMuted, fontWeight: '700' }}>{on ? '✓' : ''}</Label>
    </View>
    <Label>{kind}</Label>
  </Pressable>;
}
