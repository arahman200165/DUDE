import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'data-uri-converter';

/** File selection itself isn't PersistenceService-backed — only the text fields are mirrored. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const direction = readStorageValue<'generate' | 'decode'>(TOOL_ID, 'direction', 'local') ?? 'generate';
    const text = readStorageValue<string>(TOOL_ID, 'text', 'session');
    const mimeType = readStorageValue<string>(TOOL_ID, 'mimeType', 'local') ?? 'text/plain';
    const filename = readStorageValue<string>(TOOL_ID, 'filename', 'local') ?? 'download.bin';
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const content = direction === 'decode' ? input : text;
    if (!content) return undefined;

    const preview = content.length > 40 ? `${content.slice(0, 40)}…` : content;
    return {
      state: { direction, text, mimeType, filename, input },
      summary: `${direction === 'generate' ? 'Generated' : 'Decoded'} data URI: "${preview}"`,
    };
  },

  restore(state): void {
    if (state['direction'] === 'generate' || state['direction'] === 'decode') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['text'] === 'string') writeStorageValue(TOOL_ID, 'text', 'session', state['text']);
    if (typeof state['mimeType'] === 'string') writeStorageValue(TOOL_ID, 'mimeType', 'local', state['mimeType']);
    if (typeof state['filename'] === 'string') writeStorageValue(TOOL_ID, 'filename', 'local', state['filename']);
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
  },
};
