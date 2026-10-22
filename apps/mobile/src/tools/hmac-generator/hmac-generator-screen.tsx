import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ErrorBanner, InputEditor, ModeSegment, OutputViewer, SecretField, ToolScreen, useToolPreference } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Label } from '../../ui/primitives';
import { HASHES, hmacFor, KEY_ENCODINGS, type HmacOutcome, type HmacOutputFormat } from './hmac-generator-mobile';
import type { HmacHashAlgorithm, HmacKeyEncoding } from '@dude/tool-engine/tools/hmac-generator/hmac-generator-logic';

const TOOL_ID = 'hmac-generator';
const KEY_PREFIX = 'key-';
const OUT_PREFIX = 'out-';
const HASH_MODES = HASHES.map(id => ({ id, label: id }));
const KEY_MODES = KEY_ENCODINGS.map(({ id, label }) => ({ id: KEY_PREFIX + id, label }));
const OUT_MODES = [{ id: `${OUT_PREFIX}hex`, label: 'Hex' }, { id: `${OUT_PREFIX}base64`, label: 'Base64' }];

/**
 * Message and key live only in the in-memory tool input (never persisted or synced; wiped after a long background) and the
 * key is masked by default. Stored preferences: the web tool's `hash` and `keyEncoding`, plus `outputFormat` (mobile adds hex/base64 output).
 */
export default function HmacGeneratorScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { input: '', key: '' });
  const message = typeof stored.input === 'string' ? stored.input : '';
  const key = typeof stored.key === 'string' ? stored.key : '';
  const [hash, setHash] = useToolPreference<HmacHashAlgorithm>(TOOL_ID, 'hash', 'SHA-256', { decode: raw => HASHES.find(candidate => candidate === raw) ?? null });
  const [keyEncoding, setKeyEncoding] = useToolPreference<HmacKeyEncoding>(TOOL_ID, 'keyEncoding', 'utf8', { decode: raw => KEY_ENCODINGS.find(candidate => candidate.id === raw)?.id ?? null });
  const [format, setFormat] = useToolPreference<HmacOutputFormat>(TOOL_ID, 'outputFormat', 'hex', { decode: raw => raw === 'hex' || raw === 'base64' ? raw : null });
  const [showKey, setShowKey] = useState(false);
  const [outcome, setOutcome] = useState<HmacOutcome | null>(null);

  useEffect(() => {
    if (key === '') { setOutcome(null); return; }
    let cancelled = false;
    void hmacFor(message, key, keyEncoding, hash, format).then(result => { if (!cancelled) setOutcome(result); });
    return () => { cancelled = true; };
  }, [message, key, keyEncoding, hash, format]);

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <InputEditor value={message} onChangeText={text => update({ input: text })} label="Message" />
      <SecretField testID="tool-input-key" label="Key" value={key} onChangeText={text => update({ key: text })} show={showKey} onToggleShow={() => setShowKey(!showKey)} />
    </View>}
    options={<View style={{ gap: theme.metrics.spaceMajor }}>
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label style={{ fontWeight: '700' }}>Hash algorithm</Label>
        <ModeSegment label="Hash algorithm" modes={HASH_MODES} value={hash} onChange={next => setHash(next as HmacHashAlgorithm)} />
      </View>
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label style={{ fontWeight: '700' }}>Key encoding</Label>
        <ModeSegment label="Key encoding" modes={KEY_MODES} value={KEY_PREFIX + keyEncoding} onChange={next => setKeyEncoding(next.slice(KEY_PREFIX.length) as HmacKeyEncoding)} />
      </View>
      <View style={{ gap: theme.metrics.spaceNormal }}>
        <Label style={{ fontWeight: '700' }}>Output format</Label>
        <ModeSegment label="Output format" modes={OUT_MODES} value={OUT_PREFIX + format} onChange={next => setFormat(next.slice(OUT_PREFIX.length) as HmacOutputFormat)} />
      </View>
    </View>}
    output={outcome && !outcome.ok
      ? <ErrorBanner message={outcome.error} />
      : <OutputViewer value={outcome?.ok ? outcome.value : ''} label="HMAC" emptyText="Enter a key to compute the HMAC." />}
  />;
}
