import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { EnvJsonDirection } from "@dude/tool-engine/tools/env-json-converter/env-json-converter-logic";

const TOOL_ID = 'env-json-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const direction = readStorageValue<EnvJsonDirection>(TOOL_ID, 'direction', 'local') ?? 'env-to-json';

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction }, summary: `${direction === 'env-to-json' ? '.env → JSON' : 'JSON → .env'}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (state['direction'] === 'env-to-json' || state['direction'] === 'json-to-env') {
      writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    }
  },
};
