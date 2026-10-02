import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { FileBase64Direction } from './file-base64';

const TOOL_ID = 'file-base64';

/** File selection itself isn't PersistenceService-backed — only the text fields are mirrored. */
export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const direction = readStorageValue<FileBase64Direction>(TOOL_ID, 'direction', 'local') ?? 'encode';
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const output = readStorageValue<string>(TOOL_ID, 'output', 'session');
    const filename = readStorageValue<string>(TOOL_ID, 'filename', 'local') ?? 'download.bin';
    const content = direction === 'decode' ? input : output;
    if (!content) return undefined;

    const preview = content.length > 40 ? `${content.slice(0, 40)}…` : content;
    return {
      state: { direction, input, output, filename },
      summary: `${direction === 'encode' ? 'Encoded' : 'Decoded'} file: "${preview}"`,
    };
  },

  restore(state): void {
    if (state['direction'] === 'encode' || state['direction'] === 'decode') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['output'] === 'string') writeStorageValue(TOOL_ID, 'output', 'session', state['output']);
    if (typeof state['filename'] === 'string') writeStorageValue(TOOL_ID, 'filename', 'local', state['filename']);
  },
};
