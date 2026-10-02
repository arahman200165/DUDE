import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'compression-lab';

/** Only the text-input path is mirrored — a File selection is never routed through PersistenceService. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const text = readStorageValue<string>(TOOL_ID, 'text', 'session');
    if (!text) return undefined;

    const inputMode = readStorageValue<'text' | 'file'>(TOOL_ID, 'inputMode', 'local') ?? 'text';
    const direction = readStorageValue<'compress' | 'decompress'>(TOOL_ID, 'direction', 'local') ?? 'compress';
    const format = readStorageValue<string>(TOOL_ID, 'format', 'local') ?? 'gzip';
    const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    return { state: { inputMode, direction, format, text }, summary: `${direction} (${format}): "${preview}"` };
  },

  restore(state): void {
    if (state['inputMode'] === 'text' || state['inputMode'] === 'file') writeStorageValue(TOOL_ID, 'inputMode', 'local', state['inputMode']);
    if (state['direction'] === 'compress' || state['direction'] === 'decompress') {
      writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    }
    if (typeof state['format'] === 'string') writeStorageValue(TOOL_ID, 'format', 'local', state['format']);
    if (typeof state['text'] === 'string') writeStorageValue(TOOL_ID, 'text', 'session', state['text']);
  },
};
