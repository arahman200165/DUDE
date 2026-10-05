import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import type { DestructivePreview, SyncCategory, SyncChoice } from '../../src/state/workbench-model';
import { useWorkbench } from '../../src/state/workbench-provider';
import { ActionButton, Button, Label, Screen, Section } from '../../src/ui/primitives';
import { ConnectionStatus } from '../../src/ui/connection-status';

const NAMES: Record<SyncCategory, string> = { favorites: 'Favorites', settings: 'Settings' };
const CHOICES: readonly { id: SyncChoice; title: string; detail: string }[] = [
  { id: 'merge', title: 'Merge (recommended)', detail: 'Keep the union of local and Hub records; overlapping values use the Hub value.' },
  { id: 'hub', title: 'Use Hub', detail: 'Replace this category with Hub records. Local values and pending edits are kept in a recovery copy first.' },
  { id: 'local', title: 'Use local', detail: 'Keep local values for overlaps and publish them to your Hub; retain Hub-only records.' },
];
export default function SyncScreen() {
  const router = useRouter();
  const { snapshot, actions } = useWorkbench();
  const preview = snapshot.firstSyncPreview;
  const [choices, setChoices] = useState<Partial<Record<SyncCategory, SyncChoice>>>({});
  const [confirmation, setConfirmation] = useState<DestructivePreview>();
  useEffect(() => { setChoices({}); setConfirmation(undefined); }, [preview?.id]);
  const ready = !!preview && preview.categories.every(row => choices[row.category]);
  const useHub = preview?.categories.some(row => choices[row.category] === 'hub');
  return <Screen>
    <Section title="Synchronization"><ConnectionStatus />
      <ActionButton title="Sync now" disabled={!snapshot.capabilities.sync} onPress={() => actions.syncNow()} />
      <Button title="Recovery and cached environments" onPress={() => router.push('/settings/recovery')} />
    </Section>
    <Section title="Category consent">
      <Label>Only favorites and approved settings synchronize on Android. Enrollment alone does not send these records.</Label>
      {(snapshot.sync.categories ?? []).map(row => <Section key={row.category} title={NAMES[row.category]}>
        <Label>{row.enabled ? 'Enabled' : 'Off'}{row.detail ? ` · ${row.detail}` : ''}</Label>
        <ActionButton title={row.enabled ? `Turn ${NAMES[row.category].toLowerCase()} off` : `Enable ${NAMES[row.category].toLowerCase()} and review`} disabled={!snapshot.capabilities.sync} onPress={() => actions.setSyncCategory(row.category, !row.enabled)} />
      </Section>)}
      <Label muted>Turning a category off keeps its cache and pending edits. Re-enabling it requires a fresh Hub snapshot and consent preview.</Label>
      <ActionButton title="Refresh consent preview" disabled={!snapshot.capabilities.sync} onPress={() => actions.previewSync()} />
    </Section>
    {preview && <Section title="First sync: choose each category">
      {preview.authorityChange && <Section title="Review changed Hub authority">
        <Label mono>Previous Hub: {preview.authorityChange.previousHubInstanceId} · epoch {preview.authorityChange.previousEpoch} · acknowledged head {preview.authorityChange.previousHead}</Label>
        <Label mono>New Hub: {preview.authorityChange.hubInstanceId} · epoch {preview.authorityChange.epoch}</Label>
        <Label>A recovery copy retains the old authority and history. Merge or Use local preserves and republishes locally acknowledged values missing from the new Hub. Use Hub is refused if its snapshot regresses acknowledged history.</Label>
      </Section>}
      <Label>Viewing or refreshing this preview sends no edits. Approving explicitly permits replay of previously claimed requests with their stable operation IDs to resolve uncertain delivery. If that changes the Hub snapshot, you must review and approve a fresh preview before selected categories are replaced.</Label>
      {preview.categories.map(row => <Section key={row.category} title={`${NAMES[row.category]} · ${row.localCount} local · ${row.hubCount} Hub`}>
        {CHOICES.map(choice => <Section key={choice.id} title={choice.title}>
          <Label muted>{choice.detail}</Label>
          <Button title={`Choose ${choice.title} for ${NAMES[row.category].toLowerCase()}`} selected={choices[row.category] === choice.id} onPress={() => { setChoices(current => ({ ...current, [row.category]: choice.id })); setConfirmation(undefined); }} />
        </Section>)}
      </Section>)}
      {useHub ? <>
        <ActionButton title="Preview replacement with Hub values" disabled={!ready} onPress={async () => {
          const result = await actions.previewSyncApproval(choices, preview.id);
          if (!result.ok) return result;
          setConfirmation(result.value);
          return { ok: true, value: undefined };
        }} />
        {confirmation && <Section title="Confirm Use Hub">
          <Label>{confirmation.records ?? 'Cached'} local records · {confirmation.pending} pending edits. The categories selected as Use Hub will be replaced; a durable recovery copy will be kept first.</Label>
          <Label muted>The confirmation binds these choices and this unchanged preview, and expires after 60 seconds.</Label>
          <ActionButton title="Confirm choices and replace selected categories" onPress={async () => {
            const token = confirmation.token;
            setConfirmation(undefined);
            return actions.approveSync(choices, preview.id, token);
          }} />
        </Section>}
      </> : <ActionButton title="Approve choices and start sync" disabled={!ready} onPress={() => actions.approveSync(choices, preview.id)} />}
    </Section>}
  </Screen>;
}
