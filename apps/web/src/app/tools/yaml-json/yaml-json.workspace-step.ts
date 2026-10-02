import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type JsonIndent, type YamlDirection } from "@dude/tool-engine/tools/yaml-json/yaml-convert";

const TOOL_ID = 'yaml-json';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const direction = readStorageValue<YamlDirection>(TOOL_ID, 'direction', 'local') ?? 'yaml-to-json';
    const indent = readStorageValue<JsonIndent>(TOOL_ID, 'indent', 'local') ?? 2;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction, indent }, summary: `${direction}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (state['indent'] === 'tab' || typeof state['indent'] === 'number') writeStorageValue(TOOL_ID, 'indent', 'local', state['indent']);
  },
};
