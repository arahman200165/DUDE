import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'structured-data-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    const fromFormat = readStorageValue<string>(TOOL_ID, 'fromFormat', 'local') ?? 'json';
    const toFormat = readStorageValue<string>(TOOL_ID, 'toFormat', 'local') ?? 'yaml';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    if (!input) return undefined;

    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, fromFormat, toFormat, paneRatio }, summary: `${fromFormat} → ${toFormat}: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['fromFormat'] === 'string') writeStorageValue(TOOL_ID, 'fromFormat', 'local', state['fromFormat']);
    if (typeof state['toFormat'] === 'string') writeStorageValue(TOOL_ID, 'toFormat', 'local', state['toFormat']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
