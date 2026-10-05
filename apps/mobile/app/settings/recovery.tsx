import { useState } from 'react';
import { ScrollView, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useWorkbench } from '../../src/state/workbench-provider';
import { ActionButton, Button, Field, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';
import { GuardedAction } from '../../src/ui/guarded-action';

export default function RecoveryScreen() {
  const router = useRouter();
  const { snapshot, actions } = useWorkbench();
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const current = snapshot.recovery?.contextId;
  const exportContext = async (contextId?: string) => {
    const result = await actions.exportRecovery(contextId);
    if (!result.ok) return result;
    setExportText(result.value.text);
    return { ok: true as const, value: undefined };
  };
  return <Screen>
    <Section title="Recovery"><ConnectionStatus />
      {snapshot.recovery?.warning && <Label accessibilityRole="alert">{snapshot.recovery.warning}</Label>}
      <Label>Revoked devices and missing native keys keep a read-only cache and preserve pending edits. A new pairing uses the same device ID with a fresh native key and repeats category consent.</Label>
      <ActionButton title="Retry session or pending registration" disabled={!snapshot.capabilities.recover} onPress={() => actions.recover()} />
      <Button title="Review a new pairing" onPress={() => router.push('/settings/connection')} />
      {snapshot.recovery?.enrolledContextId && snapshot.recovery.enrolledContextId !== current && <ActionButton title="Return to enrolled environment" onPress={() => actions.selectArchive(snapshot.recovery!.enrolledContextId!)} />}
      {snapshot.recovery?.standaloneContextId && snapshot.recovery.standaloneContextId !== current && <ActionButton title="View standalone workbench" onPress={() => actions.selectArchive(snapshot.recovery!.standaloneContextId!)} />}
    </Section>
    <Section title="Manual recovery transfer">
      <Label>Export contains cached records, settings, pending edits and device identity. It contains no key reference, private key, pairing code, signature or session token. It is not encrypted; choose where you keep or share your workbench data.</Label>
      <Label muted>Android cloud backup excludes this store and its keys. Use this explicit copy/paste or share flow to move data manually. Import preserves a read-only archive; a native key must be created through pairing.</Label>
      <ActionButton title="Prepare recovery export" disabled={!snapshot.capabilities.exportRecovery} onPress={() => exportContext()} />
      {exportText && <>
        <Label>Recovery export — long-press to select and copy</Label>
        <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}><Label mono selectable accessibilityLabel="Recovery export text">{exportText}</Label></ScrollView>
        <ActionButton title="Share recovery export" onPress={async () => {
          await Share.share({ message: exportText, title: 'DUDE mobile recovery' });
          return { ok: true, value: undefined };
        }} />
        <Button title="Hide export text" onPress={() => setExportText('')} />
      </>}
      <Field label="Paste a recovery export to import" value={importText} onChangeText={setImportText} multiline autoCorrect={false} autoCapitalize="none" textAlignVertical="top" style={{ maxHeight: 240 }} />
      <ActionButton title="Import as read-only cached environment" disabled={!importText.trim() || snapshot.durability !== 'durable'} onPress={async () => {
        const result = await actions.importRecovery(importText);
        if (result.ok) setImportText('');
        return result;
      }} />
    </Section>
    <Section title="Cached environments and archives">
      {(snapshot.recovery?.archives ?? []).map(archive => <Section key={archive.id} title={archive.environmentId}>
        <Label mono>Device ID: {archive.deviceId}</Label>
        <Label>{archive.records} cached records · {archive.pending} pending edits{archive.selected ? ' · viewing' : ''}</Label>
        <ActionButton title="View read-only archive" onPress={() => actions.selectArchive(archive.id)} />
        <ActionButton title="Prepare archive recovery export" onPress={() => exportContext(archive.id)} />
        <Button title="Re-pair this cached environment" onPress={() => router.push({ pathname: '/settings/connection', params: { contextId: archive.id } })} />
        {archive.kind === 'archive' ? <GuardedAction title="Continue standalone" confirmTitle="Confirm copying cached data to standalone" explanation="Copy this cache into the standalone workbench. The archive and its pending operations remain intact for export or later re-pairing. Existing standalone data gets a recovery copy first." preview={() => actions.previewStandalone(archive.id)} confirm={token => actions.continueStandalone(token, archive.id)} /> : <Label muted>Disconnect this environment to retain an archive before copying it to standalone.</Label>}
      </Section>)}
      {!snapshot.recovery?.archives.length && <Label muted>No read-only cached environments.</Label>}
    </Section>
    <Section title="Saved recovery copies">
      {(snapshot.recovery?.copies ?? []).map(copy => <Section key={copy.id} title={copy.reason}>
        <Label muted>{copy.createdAt}</Label>
        <ActionButton title="Prepare saved recovery copy export" onPress={async () => {
          const result = await actions.exportRecoveryCopy(copy.id);
          if (!result.ok) return result;
          setExportText(result.value.text);
          return { ok: true, value: undefined };
        }} />
      </Section>)}
      {!snapshot.recovery?.copies.length && <Label muted>No saved recovery copies.</Label>}
    </Section>
    {snapshot.recovery?.pendingAttempt && <GuardedAction title="Discard pending registration" confirmTitle="Confirm discarding this pending registration key" explanation="Recovery should be tried first. Discard removes the unconfirmed native key and receipt, keeping cached records and pending edits. A Hub row may already exist; ask its owner to revoke it before pairing again." preview={() => actions.previewDiscardAttempt()} confirm={token => actions.discardAttempt(token)} />}
    <GuardedAction title="Clear local cache" confirmTitle="Confirm clearing cached records and pending edits" disabled={!snapshot.capabilities.clearCache || !current} explanation="Clear this selected cache and pending edits after saving a durable local recovery copy. This does not delete Hub data or the enrollment. An enrolled device must review a fresh snapshot before sync resumes." preview={() => actions.previewClearCache()} confirm={token => actions.clearCache(token)} />
  </Screen>;
}
