import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type SchemaDraftMode } from "@dude/tool-engine/tools/json-schema-validator/schema-validate";

const TOOL_ID = 'json-schema-validator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const schema = readStorageValue<string>(TOOL_ID, 'schema', 'session');
    const instance = readStorageValue<string>(TOOL_ID, 'instance', 'session');
    if (!schema && !instance) return undefined;
    const draftMode = readStorageValue<SchemaDraftMode>(TOOL_ID, 'draftMode', 'local') ?? 'auto';
    return { state: { schema: schema ?? '', instance: instance ?? '', draftMode }, summary: 'JSON Schema validation' };
  },
  restore(state): void {
    if (typeof state['schema'] === 'string') writeStorageValue(TOOL_ID, 'schema', 'session', state['schema']);
    if (typeof state['instance'] === 'string') writeStorageValue(TOOL_ID, 'instance', 'session', state['instance']);
    if (typeof state['draftMode'] === 'string') writeStorageValue(TOOL_ID, 'draftMode', 'local', state['draftMode']);
  },
};
