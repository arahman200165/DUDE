import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TOOL_METADATA } from '@dude/tool-registry';
import type { PasteDetector } from '@dude/domain/shared/models/paste-detector.model';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { detectShapes } from '@dude/tool-engine/core/paste-detect/paste-detect';
import { formatByteSize, type FileInputSource } from '../src/kit/file-io-core';
import { discoverTools, TOOL_BY_ID } from '../src/registry/discovery';
import { partitionCatalog } from '../src/registry/catalog-partition';
import { MOBILE_BINDINGS } from '../src/registry/mobile-bindings.generated';
import { clearPendingShare } from '../src/share/native';
import { classifyShare, eligibleToolIds, imageExtension, planShare, runnableToolIds, sharePreview, shouldRedactPreview, suggestShareTools, type ShareClassification, type ShareSuggestion } from '../src/share/share-model';
import { shareStore } from '../src/share/share-store';
import { usePendingShare } from '../src/share/use-incoming-share';
import { toolInputStore } from '../src/tools-host/tool-input-store';
import { useWorkbench } from '../src/state/workbench-provider';
import { Button, Field, Label, Section } from '../src/ui/primitives';
import { ToolRow } from '../src/ui/tool-row';

const METADATA = TOOL_METADATA as readonly FileInputSource[];
const RUNNABLE_IDS = runnableToolIds(TOOL_METADATA, MOBILE_BINDINGS);

/** Writes a shared image to the app cache so the scanner tools can read it as `{ imageUri }`. */
async function cacheImage(base64: string, mimeType: string): Promise<string> {
  const system = await import('expo-file-system');
  const file = new system.File(system.Paths.cache, `dude-shared-${Date.now()}.${imageExtension(mimeType)}`);
  file.create({ overwrite: true });
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

export default function ShareScreen() {
  const { theme } = useWorkbench();
  const router = useRouter();
  const pending = usePendingShare();
  const [query, setQuery] = useState('');
  const [problem, setProblem] = useState<string>();
  const [detectors, setDetectors] = useState<readonly PasteDetector[]>([]);
  const classification = useMemo<ShareClassification | null>(() => pending && 'share' in pending ? classifyShare(pending.share) : null, [pending]);
  const eligible = useMemo(() => classification ? eligibleToolIds(classification, RUNNABLE_IDS) : [], [classification]);
  const text = classification?.category === 'text' ? classification.text : '';
  useEffect(() => {
    if (!text) return;
    let active = true;
    // The curated detector registry pulls in several tool engines, so it loads lazily and only for shared text.
    void import('@dude/tool-engine/core/paste-detect/paste-detectors').then(module => { if (active) setDetectors(module.PASTE_DETECTORS); });
    return () => { active = false; };
  }, [text]);
  const suggestions = useMemo<ShareSuggestion[]>(() => text && detectors.length ? suggestShareTools(text, detectShapes, detectors, TOOL_BY_ID, eligible) : [], [text, detectors, eligible]);
  // Until the detectors load the preview stays hidden, so a secret never flashes on screen.
  const redact = useMemo(() => text !== '' && (detectors.length === 0 || shouldRedactPreview(text, detectShapes(text, detectors, id => TOOL_BY_ID.get(id)).map(match => match.toolId))), [text, detectors]);
  const list = useMemo(() => {
    const allowed = new Set(eligible);
    return partitionCatalog(discoverTools(query).filter(tool => allowed.has(tool.id)), MOBILE_BINDINGS, false).entries.map(entry => entry.tool);
  }, [eligible, query]);

  const leave = () => { shareStore.clear(); clearPendingShare(); if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };
  const choose = async (toolId: string) => {
    if (!classification) return;
    const plan = planShare(classification, toolId, RUNNABLE_IDS, METADATA);
    if (!plan.ok) { setProblem(plan.reason); return; }
    try {
      toolInputStore.prefill(plan.toolId, plan.image ? { imageUri: await cacheImage(plan.image.base64, plan.image.mimeType) } : plan.prefill);
    } catch { setProblem('The shared image could not be prepared.'); return; }
    shareStore.clear();
    clearPendingShare();
    router.replace(`/tools/${plan.toolId}`);
  };
  const pick = (tool: ToolMetadata) => { setProblem(undefined); void choose(tool.id); };

  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ padding: theme.metrics.spacePanel, gap: theme.metrics.spaceMajor }} keyboardShouldPersistTaps="handled">
    <Section title="Shared content">
      {!pending && <Label muted>Nothing is shared right now. Use the Android share sheet to send text, a file or an image to DUDE.</Label>}
      {pending && 'error' in pending && <Label accessibilityRole="alert" style={{ color: theme.status.error }}>! {pending.error}</Label>}
      {classification && <>
        <Label>{classification.category === 'text' ? 'Text' : classification.category === 'image' ? 'Image' : 'File'} · {classification.label} · {formatByteSize(classification.size)}</Label>
        {classification.category === 'text' && <Label mono muted testID="share-preview">{sharePreview(text, redact)}</Label>}
        {classification.category === 'unsupported' && <Label accessibilityRole="alert" style={{ color: theme.status.error }}>! {classification.reason}</Label>}
        <Label muted>Nothing runs automatically and nothing is saved or synced. Pick a tool to open this content in it.</Label>
      </>}
      {problem && <Label accessibilityRole="alert" style={{ color: theme.status.error }}>! {problem}</Label>}
      <Button title="Dismiss" onPress={leave} hint="Discards the shared content" />
    </Section>
    {classification && classification.category !== 'unsupported' && <>
      {classification.category === 'image'
        ? <Section title="Suggested tools"><Label muted>Shared images open in a scanner.</Label></Section>
        : <Section title="Suggested tools">
          {suggestions.length === 0 && <Label muted>No specific match. Choose a tool below.</Label>}
          {suggestions.map(item => <View key={item.toolId} style={{ gap: theme.metrics.spaceMicro }}>
            <Button title={item.title} hint={item.reason} onPress={() => pick(TOOL_BY_ID.get(item.toolId)!)} />
            <Label muted style={{ fontSize: theme.metrics.textUiSm }}>{item.reason}</Label>
          </View>)}
        </Section>}
      <Section title="All tools">
        {classification.category === 'text' && <Field label="Search tools" value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" placeholder="Title, ID, keyword or category" returnKeyType="search" />}
        {list.length === 0 && <Label muted>No matching tools.</Label>}
        {list.map(tool => <ToolRow key={tool.id} tool={tool} onPress={pick} />)}
      </Section>
    </>}
  </ScrollView>;
}
