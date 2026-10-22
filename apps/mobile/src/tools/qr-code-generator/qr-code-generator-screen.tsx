import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { QrPreset } from '@dude/tool-engine/tools/qr-code-generator/qr-payload';
import {
  announce, ErrorBanner, hapticError, hapticSuccess, InputEditor, ModeSegment, OptionsSheet, ResultCard, saveBase64File, saveTextFile, shareFile, shareText,
  ToolScreen, useToolPreferences, writeClipboard, type OptionSpec, type OptionValue,
} from '../../kit';
import { coerceOption, optionKey } from '../../kit/text-tool-controller';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Field, Label } from '../../ui/primitives';
import {
  buildPayload, clampQuietZone, decodeEcLevel, decodePreset, decodeWifiSecurity, DEFAULT_EXPORT_SIZE, DEFAULT_QUIET_ZONE, displayPayload, EC_LEVELS, encodeQr, EXPORT_SIZES,
  PRESETS, qrPathData, qrSvgString, sizeLabel, totalModules, WIFI_SECURITIES, type EcLevel, type QrFields, type WifiSecurity,
} from './qr-code-generator-mobile';

const TOOL_ID = 'qr-code-generator';
const MAX_PREVIEW = 320;

// Persisted preferences reuse the web keys: `preset`, `ecLevel`, `wifiSecurity`, `wifiHidden` (all `local`). Everything the user
// types is `session` on web, so it lives in the in-memory tool input; the Wi-Fi password and TOTP secret are component state only
// and are dropped when the app leaves the foreground.
const ENTRIES = [
  { key: 'preset', defaultValue: 'text' as unknown, codec: { decode: decodePreset } },
  { key: 'ecLevel', defaultValue: 'M' as unknown, codec: { decode: decodeEcLevel } },
  { key: 'wifiSecurity', defaultValue: 'WPA' as unknown, codec: { decode: decodeWifiSecurity } },
  { key: 'wifiHidden', defaultValue: false as unknown, codec: { decode: (raw: unknown) => typeof raw === 'boolean' ? raw : null } },
];

const INPUT_DEFAULTS = {
  text: 'https://example.com', wifiSsid: '', contactName: '', contactPhone: '', contactEmail: '', contactOrg: '', totpIssuer: '', totpAccount: '',
};

const str = (value: unknown): string => typeof value === 'string' ? value : '';

function SecretInput({ label, value, onChangeText, testID, show, onToggle }: {
  readonly label: string; readonly value: string; readonly onChangeText: (text: string) => void; readonly testID: string; readonly show: boolean; readonly onToggle: () => void;
}) {
  const { theme } = useWorkbench();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: theme.metrics.spaceMicro }}>
    <Label>{label}</Label>
    <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChangeText} secureTextEntry={!show}
      autoCorrect={false} autoCapitalize="none" autoComplete="off" spellCheck={false} importantForAutofill="no" allowFontScaling
      placeholderTextColor={theme.colors.textMuted} selectionColor={theme.colors.accent} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        color: theme.colors.text, backgroundColor: theme.colors.panel, borderColor: focused ? theme.colors.accent : theme.colors.border,
        borderWidth: focused ? theme.metrics.focusWidth : 1, borderRadius: theme.metrics.radius, minHeight: theme.metrics.controlHeight,
        paddingHorizontal: theme.metrics.spaceNormal, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily,
      }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID={`${testID}-toggle`} title={show ? 'Hide' : 'Show'} accessibilityLabel={show ? `Hide ${label}` : `Show ${label}`} onPress={onToggle} />
      <Button testID={`${testID}-clear`} title="Clear" disabled={!value} onPress={() => onChangeText('')} />
    </View>
  </View>;
}

export default function QrCodeGeneratorScreen() {
  const { theme } = useWorkbench();
  const { width: windowWidth } = useWindowDimensions();
  const [stored, update] = useToolInput(TOOL_ID, INPUT_DEFAULTS);
  const [prefs, setPref] = useToolPreferences(TOOL_ID, ENTRIES);
  const preset = (decodePreset(prefs.preset) ?? 'text') as QrPreset;
  const ecLevel = (decodeEcLevel(prefs.ecLevel) ?? 'M') as EcLevel;
  const wifiSecurity = (decodeWifiSecurity(prefs.wifiSecurity) ?? 'WPA') as WifiSecurity;
  const wifiHidden = prefs.wifiHidden === true;

  const [wifiPassword, setWifiPassword] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [showWifi, setShowWifi] = useState(false);
  const [showTotp, setShowTotp] = useState(false);
  const [quietZone, setQuietZone] = useState(DEFAULT_QUIET_ZONE);
  const [exportSize, setExportSize] = useState(DEFAULT_EXPORT_SIZE);
  const [status, setStatus] = useState<{ readonly tone: 'ok' | 'error'; readonly message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<Svg>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { setWifiPassword(''); setTotpSecret(''); setShowWifi(false); setShowTotp(false); }
    });
    return () => subscription.remove();
  }, []);

  const fields = useMemo<QrFields>(() => ({
    text: str(stored.text), wifiSsid: str(stored.wifiSsid), wifiPassword, wifiSecurity, wifiHidden,
    contactName: str(stored.contactName), contactPhone: str(stored.contactPhone), contactEmail: str(stored.contactEmail), contactOrg: str(stored.contactOrg),
    totpSecret, totpIssuer: str(stored.totpIssuer), totpAccount: str(stored.totpAccount),
  }), [stored, wifiPassword, wifiSecurity, wifiHidden, totpSecret]);
  const payload = useMemo(() => buildPayload(preset, fields), [preset, fields]);
  const revealed = preset === 'wifi' ? showWifi : preset === 'totp' ? showTotp : true;
  const shownPayload = useMemo(() => displayPayload(preset, fields, revealed), [preset, fields, revealed]);
  const encoded = useMemo(() => encodeQr(payload, ecLevel), [payload, ecLevel]);
  const matrix = encoded.ok ? encoded.matrix : null;

  const lastError = useRef<string | null>(null);
  const failure = !encoded.ok && payload.trim() !== '' ? encoded.error : null;
  useEffect(() => {
    if (failure && lastError.current !== failure) void hapticError();
    lastError.current = failure;
  }, [failure]);

  const options = useMemo<readonly OptionSpec[]>(() => [
    { kind: 'select', id: 'ecLevel', label: 'Error correction', default: 'M', choices: EC_LEVELS },
    { kind: 'number', id: 'quietZone', label: 'Quiet zone (modules)', default: DEFAULT_QUIET_ZONE, min: 0, max: 10 },
    { kind: 'select', id: 'exportSize', label: 'Export size (pixels)', default: String(DEFAULT_EXPORT_SIZE), choices: EXPORT_SIZES.map(size => ({ value: String(size), label: `${size}` })) },
    ...(preset === 'wifi' ? [{ kind: 'switch', id: 'wifiHidden', label: 'Hidden network', default: false } as const] : []),
  ], [preset]);
  const optionValues = { ecLevel, quietZone, exportSize: String(exportSize), wifiHidden };
  const onOption = (id: string, value: OptionValue) => {
    const option = options.find(candidate => candidate.id === id);
    if (!option) return;
    const next = coerceOption(option, value);
    if (id === 'ecLevel') setPref('ecLevel', next);
    else if (id === 'wifiHidden') setPref(optionKey(option), next);
    else if (id === 'quietZone') setQuietZone(clampQuietZone(Number(next)));
    else if (id === 'exportSize') setExportSize(Number(next) || DEFAULT_EXPORT_SIZE);
  };

  const side = Math.min(MAX_PREVIEW, Math.max(160, windowWidth - theme.metrics.spacePanel * 4 - 8));
  const pathData = useMemo(() => matrix ? qrPathData(matrix, quietZone) : '', [matrix, quietZone]);

  const rasterise = useCallback((): Promise<string> => new Promise((resolve, reject) => {
    const svg = svgRef.current;
    if (!svg) { reject(new Error('The QR code is not ready.')); return; }
    svg.toDataURL(base64 => (base64 ? resolve(base64) : reject(new Error('The QR code could not be rendered to an image.'))), { width: exportSize, height: exportSize });
  }), [exportSize]);

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
  const savePng = () => run(async () => {
    const result = await saveBase64File('qr.png', await rasterise(), 'image/png');
    return result.status === 'saved' ? `Saved ${result.name}` : null;
  });
  const saveSvg = () => run(async () => {
    if (!matrix) return null;
    const result = await saveTextFile('qr.svg', qrSvgString(matrix, quietZone, exportSize), 'image/svg+xml');
    return result.status === 'saved' ? `Saved ${result.name}` : null;
  });
  const shareImage = () => run(async () => {
    const base64 = await rasterise();
    const system = await import('expo-file-system');
    const file = new system.File(system.Paths.cache, 'qr-share.png');
    file.create({ overwrite: true });
    file.write(base64, { encoding: 'base64' });
    try { await shareFile(file.uri, 'image/png', 'Share QR code'); } finally { try { if (file.exists) file.delete(); } catch { /* the cache is cleared by the OS anyway */ } }
    return null;
  });
  const copyPayload = () => run(async () => await writeClipboard(payload) ? 'Copied payload' : 'Copy failed');
  const sharePayload = () => run(async () => { await shareText(payload, 'QR payload'); return null; });

  const setText = (key: keyof typeof INPUT_DEFAULTS) => (text: string) => update({ [key]: text });
  const field = (key: keyof typeof INPUT_DEFAULTS, label: string, testID: string, extra?: object) =>
    <Field testID={testID} label={label} value={str(stored[key])} onChangeText={setText(key)} autoCapitalize="none" autoCorrect={false} spellCheck={false} {...extra} />;

  const input = <View style={{ gap: theme.metrics.spaceMajor }}>
    <ModeSegment label="Preset" modes={PRESETS} value={preset} onChange={next => setPref('preset', next)} />
    {preset === 'text' && <InputEditor value={fields.text} onChangeText={setText('text')} label="Text or URL" placeholder="https://example.com" />}
    {preset === 'wifi' && <View style={{ gap: theme.metrics.spaceNormal }}>
      {field('wifiSsid', 'Network name (SSID)', 'qr-wifi-ssid')}
      <ModeSegment label="Security" modes={WIFI_SECURITIES} value={wifiSecurity} onChange={next => setPref('wifiSecurity', next)} />
      {wifiSecurity !== 'nopass' && <SecretInput label="Password" testID="qr-wifi-password" value={wifiPassword} onChangeText={setWifiPassword} show={showWifi} onToggle={() => setShowWifi(value => !value)} />}
    </View>}
    {preset === 'contact' && <View style={{ gap: theme.metrics.spaceNormal }}>
      {field('contactName', 'Name', 'qr-contact-name')}
      {field('contactPhone', 'Phone', 'qr-contact-phone', { keyboardType: 'phone-pad' })}
      {field('contactEmail', 'Email', 'qr-contact-email', { keyboardType: 'email-address' })}
      {field('contactOrg', 'Organization', 'qr-contact-org')}
    </View>}
    {preset === 'totp' && <View style={{ gap: theme.metrics.spaceNormal }}>
      <SecretInput label="Secret (Base32)" testID="qr-totp-secret" value={totpSecret} onChangeText={setTotpSecret} show={showTotp} onToggle={() => setShowTotp(value => !value)} />
      {field('totpIssuer', 'Issuer', 'qr-totp-issuer')}
      {field('totpAccount', 'Account name', 'qr-totp-account')}
      <Label muted>Uses SHA1, 6 digits and a 30 second period, like the web tool.</Label>
    </View>}
  </View>;

  const output = <View style={{ gap: theme.metrics.spaceMajor }}>
    {failure !== null && <ErrorBanner message={failure} />}
    {matrix ? <View style={{ gap: theme.metrics.spaceNormal }}>
      {/* Black modules on white regardless of theme (scannability beats theming); the frame is a token-colored panel. */}
      <View testID="qr-preview" collapsable={false} accessible accessibilityRole="image" accessibilityLabel={`QR code, ${sizeLabel(matrix)}`}
        style={{ alignSelf: 'center', padding: theme.metrics.spaceNormal, backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius }}>
        <Svg ref={svgRef} width={side} height={side} viewBox={`0 0 ${totalModules(matrix, quietZone)} ${totalModules(matrix, quietZone)}`}>
          <Rect x={0} y={0} width={totalModules(matrix, quietZone)} height={totalModules(matrix, quietZone)} fill="#ffffff" />
          <Path d={pathData} fill="#000000" />
        </Svg>
      </View>
      <Label testID="qr-size" muted style={{ textAlign: 'center' }}>{sizeLabel(matrix)}</Label>
    </View> : failure === null && <Label muted>Enter something to encode.</Label>}
    {payload.trim() !== '' && <ResultCard title="Payload">
      <Label testID="qr-payload" mono selectable>{shownPayload}</Label>
      {!revealed && <Label muted>The secret is hidden here. Show it above to see the full payload; Copy and Share always use the real value.</Label>}
    </ResultCard>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID="qr-save-png" title="Save PNG" disabled={!matrix || busy} hint="Saves the QR code as a PNG in a folder you choose" onPress={() => { void savePng(); }} />
      <Button testID="qr-share-image" title="Share image" disabled={!matrix || busy} onPress={() => { void shareImage(); }} />
      <Button testID="qr-save-svg" title="Save SVG" disabled={!matrix || busy} hint="Saves the QR code as an SVG in a folder you choose" onPress={() => { void saveSvg(); }} />
      <Button testID="qr-copy-payload" title="Copy payload" disabled={!matrix || busy} onPress={() => { void copyPayload(); }} />
      <Button testID="qr-share-payload" title="Share payload" disabled={!matrix || busy} onPress={() => { void sharePayload(); }} />
    </View>
    {status && <Label testID="qr-status" accessibilityLiveRegion="polite" accessibilityRole={status.tone === 'error' ? 'alert' : undefined}
      style={{ color: status.tone === 'error' ? theme.status.error : theme.colors.textMuted }}>{status.tone === 'error' ? '! ' : ''}{status.message}</Label>}
  </View>;

  return <ToolScreen
    input={input}
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <OptionsSheet options={options} values={optionValues} onChange={onOption} />
    </View>}
    output={output} />;
}
