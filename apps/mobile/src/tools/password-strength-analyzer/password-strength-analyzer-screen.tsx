import { useMemo } from 'react';
import { View } from 'react-native';
import { KeyValueList, SecretField, StatusPill, ToolScreen, useToolPreference } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';
import { strengthView, VERDICT_LABELS, VERDICT_TONES } from './password-strength-analyzer-mobile';

const TOOL_ID = 'password-strength-analyzer';

/**
 * The password is held only in the in-memory tool input (never persisted, never synced; wiped after a long background).
 * The only stored preference is the web tool's `showPassword` display toggle.
 */
export default function PasswordStrengthAnalyzerScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const password = typeof stored.input === 'string' ? stored.input : '';
  const [show, setShow] = useToolPreference<boolean>(TOOL_ID, 'showPassword', false, { decode: raw => typeof raw === 'boolean' ? raw : null });
  const view = useMemo(() => strengthView(password), [password]);

  return <ToolScreen
    input={<SecretField testID="tool-input" label="Password to analyze" value={password} onChangeText={text => update({ input: text })} show={show} onToggleShow={() => setShow(!show)} />}
    output={view
      ? <View style={{ gap: theme.metrics.spaceMajor }}>
        <StatusPill testID="tool-verdict" tone={VERDICT_TONES[view.verdict]} label={VERDICT_LABELS[view.verdict]} />
        <KeyValueList rows={view.rows} />
        <Label muted>The entropy figure assumes a random password; the penalties catch only common patterns, so this is not a substitute for a dictionary-based check. Nothing you type here leaves this device or is saved.</Label>
      </View>
      : <Label muted>Type a password to see its strength.</Label>}
  />;
}
