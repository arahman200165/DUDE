import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useWorkbench } from '../state/workbench-provider';
import { Button, Label } from '../ui/primitives';
import { FileInputError, fileInputLimitFor, pickTextFile, saveTextFile, type PickedTextFile } from './file-io';
import { hapticError, hapticSuccess } from './feedback';

const say = (message: string): void => { try { AccessibilityInfo.announceForAccessibility(message); } catch { /* best effort */ } };
const messageOf = (error: unknown, fallback: string): string => error instanceof FileInputError ? error.message : fallback;

/**
 * "Open file" for a text input: SAF document picker, limited by the tool's manifest `fileInput` (default 2 MiB). Calls `onText`
 * with the file's UTF-8 text. testID `tool-input-open` (suffix `-<name>` with `name`). Errors show inline and are announced.
 */
export function OpenFileButton({ toolId, onText, name, maxBytes, label = 'Open file' }: {
  readonly toolId: string; readonly onText: (text: string, file: PickedTextFile) => void; readonly name?: string; readonly maxBytes?: number; readonly label?: string;
}) {
  const { theme } = useWorkbench();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setError(null); setBusy(true);
    try {
      const file = await pickTextFile({ maxBytes: maxBytes ?? fileInputLimitFor(toolId).maxBytes });
      if (file) { onText(file.text, file); say(`Opened ${file.name}`); void hapticSuccess(); }
    } catch (failure) {
      const message = messageOf(failure, 'The file could not be opened.');
      setError(message); say(message); void hapticError();
    } finally { setBusy(false); }
  };
  return <View style={{ gap: theme.metrics.spaceMicro, maxWidth: '100%' }}>
    <Button testID={`tool-input${name ? `-${name}` : ''}-open`} title={busy ? 'Opening…' : label} disabled={busy} hint="Picks a text file from the device to use as input" onPress={() => { void open(); }} />
    {error && <Label testID={`tool-input${name ? `-${name}` : ''}-open-error`} accessibilityRole="alert" style={{ color: theme.status.error }}>! {error}</Label>}
  </View>;
}

/** "Save file" for an output: writes `text` into a folder the user picks (SAF). testID `tool-output-save` (suffix `-<name>`). */
export function SaveOutputButton({ text, fileName, name, mimeType = 'text/plain', disabled }: {
  readonly text: string; readonly fileName: string; readonly name?: string; readonly mimeType?: string; readonly disabled?: boolean;
}) {
  const { theme } = useWorkbench();
  const [status, setStatus] = useState<{ readonly tone: 'saved' | 'error'; readonly message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const save = async () => {
    setStatus(null); setBusy(true);
    try {
      const result = await saveTextFile(fileName, text, mimeType);
      if (result.status === 'saved') {
        const message = `Saved ${result.name}`;
        setStatus({ tone: 'saved', message }); say(message); void hapticSuccess();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus(null), 4000);
      }
    } catch (failure) {
      const message = messageOf(failure, 'The file could not be saved.');
      setStatus({ tone: 'error', message }); say(message); void hapticError();
    } finally { setBusy(false); }
  };
  return <View style={{ gap: theme.metrics.spaceMicro, maxWidth: '100%' }}>
    <Button testID={`tool-output${name ? `-${name}` : ''}-save`} title={busy ? 'Saving…' : 'Save'} disabled={disabled || busy} hint="Saves the output to a file in a folder you choose" onPress={() => { void save(); }} />
    {status && <Label testID={`tool-output${name ? `-${name}` : ''}-save-status`} accessibilityLiveRegion="polite" accessibilityRole={status.tone === 'error' ? 'alert' : undefined}
      style={{ color: status.tone === 'error' ? theme.status.error : theme.colors.textMuted }}>{status.tone === 'error' ? '! ' : ''}{status.message}</Label>}
  </View>;
}
