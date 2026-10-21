import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { ErrorBanner, InputEditor, KeyValueList, ToolScreen, hapticError } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';
import { colorView } from './color-converter-mobile';

const TOOL_ID = 'color-converter';

/** Web default input, so a fresh screen shows a worked example. Input stays in memory (manifest: session). */
const DEFAULT_INPUT = '#3b82f6';

export default function ColorConverterScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: DEFAULT_INPUT });
  const input = typeof stored.input === 'string' ? stored.input : '';
  const result = useMemo(() => colorView(input), [input]);

  const lastError = useRef<unknown>(null);
  useEffect(() => {
    if (!result.ok && lastError.current !== result.error) { lastError.current = result.error; void hapticError(); }
    if (result.ok) lastError.current = null;
  }, [result]);

  return <ToolScreen
    input={<InputEditor value={input} onChangeText={text => update({ input: text })} label="Color"
      placeholder="#3b82f6, rgb(59,130,246), hsl(217,91%,60%), royalblue" />}
    output={result.ok
      ? <View style={{ gap: theme.metrics.spaceMajor }}>
        {/* The swatch previews the user's own color, so its fill is user content; the frame and labels are theme tokens. */}
        <View style={{ gap: theme.metrics.spaceNormal }}>
          <View testID="color-swatch" accessible accessibilityRole="image"
            accessibilityLabel={`Color preview: ${result.view.formats.hex}${result.view.formats.name ? `, closest name ${result.view.formats.name}` : ''}`}
            style={{ borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.metrics.radius, padding: theme.metrics.spaceMicro, backgroundColor: theme.colors.panel }}>
            <View style={{ height: theme.metrics.controlHeight * 2, borderRadius: theme.metrics.radius, backgroundColor: result.view.formats.hex }} />
          </View>
          <Label testID="color-swatch-label" mono>{result.view.formats.hex}{result.view.formats.name ? ` - ${result.view.formats.name}` : ''}{result.view.alpha !== null ? ` - alpha ${result.view.alpha}` : ''}</Label>
          {result.view.alpha !== null && <Label muted>The swatch shows the color over this panel, so transparency is visible.</Label>}
        </View>
        <KeyValueList rows={result.view.rows} />
      </View>
      : input.trim() === '' ? <Label muted>Enter a color to convert.</Label> : <ErrorBanner message={result.error} />}
  />;
}
