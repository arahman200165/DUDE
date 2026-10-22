import { useMemo } from 'react';
import { View } from 'react-native';
import { decodeJwt } from '@dude/tool-engine/tools/jwt/jwt-decode';
import { checkInputBudget, DEFAULT_MAIN_THREAD_INPUT_BYTES, ErrorBanner, InputEditor, KeyValueList, OutputViewer, ResultCard, StatusPill, ToolScreen, useCrossingHaptic } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';
import { claimRows, expiryPill } from './jwt-mobile';

const TOOL_ID = 'jwt';
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * Decode-only JWT debugger. The token is sensitive: it lives only in the in-memory tool input (never persisted, synced or
 * written to the outbox; the host wipes it after the app has been in the background) and the tool has no preferences,
 * like web. The signature segment is shown raw and is never verified.
 */
export default function JwtScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '' });
  const token = typeof stored.input === 'string' ? stored.input : '';
  const tooLarge = useMemo(() => checkInputBudget(token, DEFAULT_MAIN_THREAD_INPUT_BYTES), [token]);
  useCrossingHaptic(tooLarge !== null);
  const decoded = useMemo(() => {
    if (token.trim() === '') return null;
    if (tooLarge !== null) return { ok: false as const, error: tooLarge };
    const now = new Date();
    const result = decodeJwt(token, now);
    return result.ok ? { ok: true as const, result, pill: expiryPill(result.expiry, now), rows: claimRows(result.header, result.payload) } : { ok: false as const, error: result.error };
  }, [token, tooLarge]);

  return <ToolScreen
    input={<InputEditor value={token} onChangeText={text => update({ input: text })} label="Token" placeholder="header.payload.signature" />}
    output={decoded === null ? undefined : !decoded.ok
      ?<ErrorBanner message={decoded.error} />
      : <View style={{ gap: theme.metrics.spaceMajor }}>
        <StatusPill testID="jwt-status" tone={decoded.pill.tone} label={decoded.pill.label} />
        <OutputViewer name="header" label="Header" value={pretty(decoded.result.header)} />
        <OutputViewer name="payload" label="Payload" value={pretty(decoded.result.payload)} />
        <View style={{ gap: theme.metrics.spaceNormal }}>
          <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Claims</Label>
          <KeyValueList rows={decoded.rows} emptyText="No claims." />
        </View>
        <ResultCard title="Signature" tone="warning">
          <StatusPill testID="jwt-signature-note" tone="warning" label="Signature not verified" />
          <Label muted>Decoding only reads the header and payload. A decoded token is not proof that it is authentic or untampered; use the separate verification tool to check the signature.</Label>
          <OutputViewer name="signature" label="Signature (raw, undecoded)" value={decoded.result.signature ?? ''} emptyText="No signature segment." />
        </ResultCard>
      </View>}
  />;
}
