import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'docker-run-compose-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const direction = readStorageValue<string>(TOOL_ID, 'direction', 'local') ?? 'run-to-compose';
    const serviceName = readStorageValue<string>(TOOL_ID, 'serviceName', 'local') ?? 'app';
    return { state: { direction, serviceName, input }, summary: `Docker ${direction}: ${serviceName}` };
  },

  restore(state): void {
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['serviceName'] === 'string') writeStorageValue(TOOL_ID, 'serviceName', 'local', state['serviceName']);
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
  },
};
