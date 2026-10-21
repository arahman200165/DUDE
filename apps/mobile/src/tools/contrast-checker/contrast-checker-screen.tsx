import { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { ErrorBanner, KeyValueList, ResultCard, ToolScreen, hapticError, hapticSelection } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { ColorField } from './color-field';
import { contrastView, previewHex } from './contrast-checker-mobile';

const TOOL_ID = 'contrast-checker';

/** Web defaults (manifest: session inputs, so nothing is persisted). */
const DEFAULTS = { foreground: '#0f172a', background: '#ffffff' };

export default function ContrastCheckerScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, DEFAULTS);
  const foreground = typeof stored.foreground === 'string' ? stored.foreground : '';
  const background = typeof stored.background === 'string' ? stored.background : '';
  const result = useMemo(() => contrastView(foreground, background), [foreground, background]);
  const foregroundPreview = useMemo(() => previewHex(foreground), [foreground]);
  const backgroundPreview = useMemo(() => previewHex(background), [background]);

  const lastError = useRef<unknown>(null);
  useEffect(() => {
    if (!result.ok && lastError.current !== result.error) { lastError.current = result.error; void hapticError(); }
    if (result.ok) lastError.current = null;
  }, [result]);

  const swap = () => { update({ foreground: background, background: foreground }); void hapticSelection(); };

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ColorField name="foreground" label="Foreground" value={foreground} onChangeText={text => update({ foreground: text })} previewColor={foregroundPreview} />
      <ColorField name="background" label="Background" value={background} onChangeText={text => update({ background: text })} previewColor={backgroundPreview} />
      <View style={{ flexDirection: 'row' }}>
        <Button testID="tool-swap" title="Swap colors" hint="Exchanges the foreground and background colors" onPress={swap} />
      </View>
    </View>}
    output={result.ok
      ? <View style={{ gap: theme.metrics.spaceMajor }}>
        {/* The sample is user content: it is painted with the user's two colors, inside a frame drawn from theme tokens. */}
        <View style={{ gap: theme.metrics.spaceNormal }}>
          <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Sample</Label>
          <View testID="contrast-sample" accessible accessibilityLabel={`Sample text in ${result.view.foreground} on ${result.view.background}`}
            style={{ borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.metrics.radius, padding: theme.metrics.spaceMicro, backgroundColor: theme.colors.panel }}>
            <View style={{ backgroundColor: result.view.background, borderRadius: theme.metrics.radius, padding: theme.metrics.spacePanel, gap: theme.metrics.spaceNormal }}>
              <Text allowFontScaling style={{ color: result.view.foreground, fontSize: theme.metrics.textUi }}>The quick brown fox jumps over the lazy dog.</Text>
              <Text allowFontScaling style={{ color: result.view.foreground, fontSize: theme.metrics.textUi * 1.75, fontWeight: '700' }}>Large text sample</Text>
            </View>
          </View>
        </View>
        <KeyValueList rows={[{ key: 'ratio', label: 'Contrast ratio', value: result.view.ratioText }]} />
        <ResultCard title="WCAG 2.x checks">
          {result.view.checks.map(check => <View key={check.key} testID={`check-${check.key}`} accessible accessibilityLabel={`${check.label}: ${check.pass ? 'pass' : 'fail'}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal, minHeight: theme.metrics.rowHeight }}>
            <Label style={{ flex: 1 }}>{check.label}</Label>
            <Label testID={`check-${check.key}-result`} style={{ color: check.pass ? theme.status.success : theme.status.error, fontWeight: '700' }}>{check.pass ? '✓ Pass' : '✕ Fail'}</Label>
          </View>)}
        </ResultCard>
        <Label muted>Transparency is ignored, as in the web tool: both colors are compared as opaque.</Label>
      </View>
      : <ErrorBanner message={result.error} />}
  />;
}
