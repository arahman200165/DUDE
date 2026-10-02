import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'curl-converter';

/**
 * `raw` (the cURL command) is deliberately unpersisted — see curl-converter.ts's own doc comment
 * (routinely carries Authorization headers/cookies). Only the safe `exportFormat` preference is
 * mirrored; not History-eligible since the actual command is never captured.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const exportFormat = readStorageValue<string>(TOOL_ID, 'exportFormat', 'local');
    if (!exportFormat) return undefined;
    return { state: { exportFormat }, summary: `cURL Converter (${exportFormat})` };
  },

  restore(state): void {
    if (typeof state['exportFormat'] === 'string') writeStorageValue(TOOL_ID, 'exportFormat', 'local', state['exportFormat']);
  },
};
