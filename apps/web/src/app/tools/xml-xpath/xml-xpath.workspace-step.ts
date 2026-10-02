import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'xml-xpath';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const xmlInput = readStorageValue<string>(TOOL_ID, 'xmlInput', 'session');
    const expression = readStorageValue<string>(TOOL_ID, 'expression', 'local') ?? '';
    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    if (!xmlInput) return undefined;

    return { state: { xmlInput, expression, paneRatio }, summary: `XPath "${expression}"` };
  },

  restore(state): void {
    if (typeof state['xmlInput'] === 'string') writeStorageValue(TOOL_ID, 'xmlInput', 'session', state['xmlInput']);
    if (typeof state['expression'] === 'string') writeStorageValue(TOOL_ID, 'expression', 'local', state['expression']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
  },
};
