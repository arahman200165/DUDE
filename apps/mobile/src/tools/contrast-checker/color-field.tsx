import { View } from 'react-native';
import { SingleLineField } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';

/**
 * Single-line color input with Paste and Clear (the kit's `SingleLineField`), plus a small framed chip showing the parsed user color
 * (`previewColor`, null while the text is not a color). The chip fill is user content; its frame is a theme token.
 */
export function ColorField({ name, label, value, onChangeText, previewColor }: {
  readonly name: string; readonly label: string; readonly value: string; readonly onChangeText: (text: string) => void; readonly previewColor: string | null;
}) {
  const { theme } = useWorkbench();
  const chip = <View testID={`tool-input-${name}-chip`} accessible accessibilityLabel={previewColor ? `${label} preview` : `${label} is not a color`}
    style={{ width: theme.metrics.touchMin, height: theme.metrics.touchMin, borderRadius: theme.metrics.radius, borderWidth: 2, borderColor: theme.colors.border, padding: theme.metrics.spaceMicro, backgroundColor: theme.colors.panel, justifyContent: 'center', alignItems: 'center' }}>
    {previewColor
      ? <View style={{ flex: 1, alignSelf: 'stretch', borderRadius: theme.metrics.radius, backgroundColor: previewColor }} />
      : <Label muted>?</Label>}
  </View>;
  return <SingleLineField name={name} label={label} value={value} onChangeText={onChangeText} placeholder="#rrggbb, rgb(), hsl(), name" leading={chip} trimPaste />;
}
