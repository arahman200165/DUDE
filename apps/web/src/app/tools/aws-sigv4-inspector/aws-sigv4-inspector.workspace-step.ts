import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'aws-sigv4-inspector';

/**
 * `accessKey`/`secretKey`/`sessionToken` and the request/inspect fields are plain in-memory
 * signals, never persisted. Only the safe mode/region/service preferences are mirrored; not
 * History-eligible, since without the credentials this tool's state has nothing meaningful to log.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const mode = readStorageValue<'build' | 'inspect'>(TOOL_ID, 'mode', 'local');
    if (!mode) return undefined;

    const region = readStorageValue<string>(TOOL_ID, 'region', 'local') ?? 'us-east-1';
    const service = readStorageValue<string>(TOOL_ID, 'service', 'local') ?? 'execute-api';
    return { state: { mode, region, service }, summary: `AWS SigV4 (${mode})` };
  },

  restore(state): void {
    if (state['mode'] === 'build' || state['mode'] === 'inspect') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (typeof state['region'] === 'string') writeStorageValue(TOOL_ID, 'region', 'local', state['region']);
    if (typeof state['service'] === 'string') writeStorageValue(TOOL_ID, 'service', 'local', state['service']);
  },
};
