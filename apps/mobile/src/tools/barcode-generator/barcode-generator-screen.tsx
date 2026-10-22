import { useCallback, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import type Svg from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import { BARCODE_SYMBOLOGIES, barcodeSymbologyInfo, DEFAULT_BARCODE_SYMBOLOGY, renderBarcodeSvg, type BarcodeSymbology } from '@dude/tool-engine/tools/barcode-generator/barcode-render';
import {
  announce, ErrorBanner, hapticError, hapticSuccess, InputEditor, ModeSegment, OptionsSheet, saveBase64File, saveTextFile, shareFile, ToolScreen,
  useToolPreferences, type OptionSpec, type OptionValue,
} from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import {
  decodeFormat, decodeIncludeText, decodeScale, DEFAULT_SCALE, fileNameFor, previewSize, SCALES, valueAfterSymbologyChange,
} from './barcode-generator-mobile';

const TOOL_ID = 'barcode-generator';
const DEFAULT_VALUE = '123456789012';

// Web keys: `format` (symbology id, legacy names decode), `scale` (number) and `includeText`, all `local`. The value is `session`
// on web, so it stays in the in-memory tool input. (`preview-background` is not offered: the barcode is always black on white.)
const ENTRIES = [
  { key: 'format', defaultValue: DEFAULT_BARCODE_SYMBOLOGY as unknown, codec: { decode: decodeFormat } },
  { key: 'scale', defaultValue: DEFAULT_SCALE as unknown, codec: { decode: decodeScale } },
  { key: 'includeText', defaultValue: true as unknown, codec: { decode: decodeIncludeText } },
];
const MODES = BARCODE_SYMBOLOGIES.map(item => ({ id: item.id, label: item.label }));
const OPTIONS: readonly OptionSpec[] = [
  { kind: 'select', id: 'scale', label: 'Scale (pixels per module)', default: String(DEFAULT_SCALE), choices: SCALES.map(scale => ({ value: String(scale), label: String(scale) })) },
  { kind: 'switch', id: 'includeText', label: 'Show text under linear barcodes', default: true },
];

export default function BarcodeGeneratorScreen() {
  const { theme } = useWorkbench();
  const { width: windowWidth } = useWindowDimensions();
  const [stored, update] = useToolInput(TOOL_ID, { value: DEFAULT_VALUE });
  const value = typeof stored.value === 'string' ? stored.value : '';
  const [prefs, setPref] = useToolPreferences(TOOL_ID, ENTRIES);
  const symbology = (decodeFormat(prefs.format) ?? DEFAULT_BARCODE_SYMBOLOGY) as BarcodeSymbology;
  const scale = decodeScale(prefs.scale) ?? DEFAULT_SCALE;
  const includeText = prefs.includeText !== false;
  const info = barcodeSymbologyInfo(symbology);
  const svgRef = useRef<Svg>(null);
  const [status, setStatus] = useState<{ readonly tone: 'ok' | 'error'; readonly message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rendered = useMemo(() => renderBarcodeSvg({ symbology, text: value, scale, includeText }), [symbology, value, scale, includeText]);

  const chooseSymbology = (next: string) => {
    const decoded = decodeFormat(next);
    if (!decoded) return;
    setPref('format', decoded);
    const sample = valueAfterSymbologyChange(value, decoded);
    if (sample !== null) update({ value: sample });
  };
  const onOption = (id: string, next: OptionValue) => {
    if (id === 'scale') { const parsed = decodeScale(Number(next)); if (parsed !== null) setPref('scale', parsed); }
    else if (id === 'includeText') setPref('includeText', next === true);
  };

  const available = Math.max(120, windowWidth - theme.metrics.spacePanel * 4 - 8);
  const display = rendered.ok ? previewSize(rendered.width, rendered.height, available) : null;

  const rasterise = useCallback((): Promise<string> => new Promise((resolve, reject) => {
    const svg = svgRef.current;
    if (!svg || !rendered.ok) { reject(new Error('The barcode is not ready.')); return; }
    svg.toDataURL(base64 => (base64 ? resolve(base64) : reject(new Error('The barcode could not be rendered to an image.'))), { width: rendered.width, height: rendered.height });
  }), [rendered]);

  const run = async (action: () => Promise<string | null>) => {
    setStatus(null); setBusy(true);
    try {
      const message = await action();
      if (message) { setStatus({ tone: 'ok', message }); announce(message); void hapticSuccess(); }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : 'That action failed.';
      setStatus({ tone: 'error', message }); announce(message); void hapticError();
    } finally { setBusy(false); }
  };
  const saveSvg = () => run(async () => {
    if (!rendered.ok) return null;
    const result = await saveTextFile(fileNameFor(symbology, 'svg'), rendered.svg, 'image/svg+xml');
    return result.status === 'saved' ? `Saved ${result.name}` : null;
  });
  const savePng = () => run(async () => {
    const result = await saveBase64File(fileNameFor(symbology, 'png'), await rasterise(), 'image/png');
    return result.status === 'saved' ? `Saved ${result.name}` : null;
  });
  const sharePng = () => run(async () => {
    const base64 = await rasterise();
    const system = await import('expo-file-system');
    const file = new system.File(system.Paths.cache, 'barcode-share.png');
    file.create({ overwrite: true });
    file.write(base64, { encoding: 'base64' });
    try { await shareFile(file.uri, 'image/png', 'Share barcode'); } finally { try { if (file.exists) file.delete(); } catch { /* the cache is cleared by the OS anyway */ } }
    return null;
  });

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment label="Symbology" modes={MODES} value={symbology} onChange={chooseSymbology} />
      <InputEditor value={value} onChangeText={text => update({ value: text })} label="Value" placeholder={info.sample} />
      <Label testID="barcode-hint" muted>{info.hint} Example: {info.sample}</Label>
    </View>}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet options={OPTIONS} values={{ scale: String(scale), includeText }} onChange={onOption} />
    </View>}
    output={<View style={{ gap: theme.metrics.spaceMajor }}>
      {!rendered.ok && <ErrorBanner message={rendered.error} />}
      {rendered.ok && display && <View style={{ gap: theme.metrics.spaceNormal }}>
        {/* The barcode is black on white whatever the theme (it must stay scannable); only the frame uses theme tokens. */}
        <View testID="barcode-preview" collapsable={false} accessible accessibilityRole="image" accessibilityLabel={`${info.label} barcode of ${value.trim()}`}
          style={{ alignSelf: 'center', padding: theme.metrics.spaceNormal, backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius }}>
          <SvgXml xml={rendered.svg} override={{ ref: svgRef, width: display.width, height: display.height }} />
        </View>
        <Label testID="barcode-size" muted style={{ textAlign: 'center' }}>{rendered.width} × {rendered.height} px</Label>
      </View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
        <Button testID="barcode-save-svg" title="Save SVG" disabled={!rendered.ok || busy} hint="Saves the barcode as an SVG in a folder you choose" onPress={() => { void saveSvg(); }} />
        <Button testID="barcode-save-png" title="Save PNG" disabled={!rendered.ok || busy} hint="Saves the barcode as a PNG in a folder you choose" onPress={() => { void savePng(); }} />
        <Button testID="barcode-share-image" title="Share image" disabled={!rendered.ok || busy} onPress={() => { void sharePng(); }} />
      </View>
      {status && <Label testID="barcode-status" accessibilityLiveRegion="polite" accessibilityRole={status.tone === 'error' ? 'alert' : undefined}
        style={{ color: status.tone === 'error' ? theme.status.error : theme.colors.textMuted }}>{status.tone === 'error' ? '! ' : ''}{status.message}</Label>}
    </View>} />;
}
