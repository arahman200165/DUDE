import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'http-request-builder';

/**
 * Request fields and pasted raw text are deliberately unpersisted — see http-request-builder.ts's
 * own doc comment. Only UI preferences (inputMode/outputFormat/assumeScheme) are mirrored; not
 * History-eligible since no request content is ever captured.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const inputMode = readStorageValue<string>(TOOL_ID, 'inputMode', 'local');
    if (!inputMode) return undefined;

    const outputFormat = readStorageValue<string>(TOOL_ID, 'outputFormat', 'local') ?? 'curl';
    const assumeScheme = readStorageValue<string>(TOOL_ID, 'assumeScheme', 'local') ?? 'https';
    return { state: { inputMode, outputFormat, assumeScheme }, summary: `HTTP Request Builder (${inputMode})` };
  },

  restore(state): void {
    if (typeof state['inputMode'] === 'string') writeStorageValue(TOOL_ID, 'inputMode', 'local', state['inputMode']);
    if (typeof state['outputFormat'] === 'string') writeStorageValue(TOOL_ID, 'outputFormat', 'local', state['outputFormat']);
    if (typeof state['assumeScheme'] === 'string') writeStorageValue(TOOL_ID, 'assumeScheme', 'local', state['assumeScheme']);
  },
};
