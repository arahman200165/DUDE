import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { IniDirection } from "@dude/tool-engine/tools/ini-formatter/ini-convert";

const TOOL_ID = 'ini-formatter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;

    const direction = readStorageValue<IniDirection>(TOOL_ID, 'direction', 'local') ?? 'ini-to-json';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    return { state: { input, direction, paneRatio }, summary: `INI (${direction})` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
