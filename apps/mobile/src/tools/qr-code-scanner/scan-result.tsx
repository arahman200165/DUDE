import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import type { ScanPayload } from '@dude/tool-engine/tools/qr-code-scanner/scan-payload';
import { announce, hapticSuccess, KeyValueList, OutputViewer, ResultCard, StatusPill, writeClipboard, type KeyValueRow } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { SECRET_MASK, scanRows } from './scan-rows';

/**
 * One classified scan. The result lives only in component state: it is never written to storage, preferences, history or the
 * outbox. A `sensitive` payload (Wi-Fi password, OTP secret) is masked until the user taps Reveal, Copy of a secret is
 * disabled while it is masked, and a copied secret shows a warning. Links are never opened automatically: "Open in browser"
 * asks for a confirmation that shows the full URL.
 */
export function ScanResultView({ payload, leadingRows = [], showClassification = true }: {
  readonly payload: ScanPayload; readonly leadingRows?: readonly KeyValueRow[]; readonly showClassification?: boolean;
}) {
  const { theme } = useWorkbench();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { rows, secrets } = scanRows(payload);
  const shownRows = [...leadingRows, ...(showClassification ? rows : [])];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') { setRevealed(false); setCopied(null); } });
    return () => subscription.remove();
  }, []);

  const toggle = () => { setRevealed(value => !value); setCopied(null); };
  const copySecret = async (row: KeyValueRow) => {
    if (!await writeClipboard(row.value)) { announce('Copy failed'); return; }
    void hapticSuccess();
    announce(`Copied ${row.label}. It contains a secret.`);
    setCopied(row.key);
  };

  return <ResultCard title="Result" tone={payload.sensitive ? 'warning' : undefined}>
    <KeyValueList rows={shownRows} />
    {secrets.length > 0 && <View style={{ gap: theme.metrics.spaceNormal }}>
      <StatusPill testID="scan-sensitive" tone="warning" label="Contains a secret" />
      <View style={{ backgroundColor: theme.colors.panel, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.metrics.radius }}>
        {secrets.map((row, index) => <View key={row.key} testID={`kv-${row.key}`} style={{
          flexDirection: 'row', alignItems: 'center', gap: theme.metrics.spaceNormal, padding: theme.metrics.spaceNormal, minHeight: theme.metrics.rowHeight,
          borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.colors.border,
        }}>
          <View style={{ flex: 1, gap: theme.metrics.spaceMicro }}>
            <Label muted style={{ fontSize: theme.metrics.textUiSm }}>{row.label}</Label>
            <Text testID={`kv-${row.key}-value`} selectable={revealed} allowFontScaling style={{ color: theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{revealed ? row.value : SECRET_MASK}</Text>
          </View>
          <Button testID={`kv-${row.key}-copy`} title={copied === row.key ? 'Copied' : 'Copy'} disabled={!revealed} hint={revealed ? `Copies the ${row.label}` : 'Reveal the secret first'} onPress={() => { void copySecret(row); }} />
        </View>)}
      </View>
    </View>}
    {payload.sensitive && <View style={{ gap: theme.metrics.spaceNormal }}>
      <Button testID="scan-reveal" title={revealed ? 'Hide secret' : 'Reveal secret'} selected={revealed} hint="Shows or hides the secret in the fields and the raw text" onPress={toggle} />
      {copied !== null && <Label testID="scan-secret-warning" accessibilityLiveRegion="polite" style={{ color: theme.status.warning }}>! A secret is on the clipboard. Other apps can read it until you copy something else.</Label>}
    </View>}
    <OutputViewer name="raw" label={payload.sensitive && !revealed ? 'Raw text (secret hidden)' : 'Raw text'} value={payload.sensitive && !revealed ? payload.redactedRaw : payload.raw} shareTitle="Scanned text" />
    {payload.kind === 'url' && <OpenLink href={payload.href} hasUserInfo={payload.hasUserInfo} />}
  </ResultCard>;
}

function OpenLink({ href, hasUserInfo }: { readonly href: string; readonly hasUserInfo: boolean }) {
  const { theme } = useWorkbench();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const open = async () => {
    setConfirming(false);
    try { await Linking.openURL(href); } catch { if (mounted.current) setError('No app could open this link.'); }
  };
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    {!confirming && <Button testID="scan-open-url" title="Open in browser" hint="Asks you to confirm the full link first" onPress={() => { setError(null); setConfirming(true); }} />}
    {confirming && <ResultCard title="Open this link?" tone="warning">
      <Text testID="scan-open-url-full" selectable allowFontScaling style={{ color: theme.colors.text, fontSize: theme.metrics.textMono, fontFamily: theme.fonts.monoFamily }}>{href}</Text>
      {hasUserInfo && <Label style={{ color: theme.status.warning }}>! This link has credentials before the host name, a common phishing marker. Check where it really goes.</Label>}
      <Label muted>Scanned codes can point anywhere. The link opens in your default browser or app.</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
        <Button testID="scan-open-url-confirm" title="Open" onPress={() => { void open(); }} />
        <Button testID="scan-open-url-cancel" title="Cancel" onPress={() => setConfirming(false)} />
      </View>
    </ResultCard>}
    {error && <Label testID="scan-open-url-error" accessibilityRole="alert" style={{ color: theme.status.error }}>! {error}</Label>}
  </View>;
}
