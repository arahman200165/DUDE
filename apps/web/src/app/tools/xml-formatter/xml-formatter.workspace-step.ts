import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type XmlIndent, type XmlMode } from "@dude/tool-engine/tools/xml-formatter/xml-format";

const TOOL_ID = 'xml-formatter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const mode = readStorageValue<XmlMode>(TOOL_ID, 'mode', 'local') ?? 'format';
    const indent = readStorageValue<XmlIndent>(TOOL_ID, 'indent', 'local') ?? 2;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, mode, indent }, summary: `XML ${mode}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['mode'] === 'string') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    if (state['indent'] === 'tab' || typeof state['indent'] === 'number') writeStorageValue(TOOL_ID, 'indent', 'local', state['indent']);
  },
};
