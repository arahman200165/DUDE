import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'markdown';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const source = readStorageValue<string>(TOOL_ID, 'source', 'session');
    if (!source) return undefined;

    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    const stylePreset = readStorageValue<string>(TOOL_ID, 'stylePreset', 'local') ?? 'default';
    const customCss = readStorageValue<string>(TOOL_ID, 'customCss', 'local') ?? '';
    const preview = source.length > 40 ? `${source.slice(0, 40)}…` : source;
    return { state: { source, paneRatio, stylePreset, customCss }, summary: `Markdown: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['source'] === 'string') writeStorageValue(TOOL_ID, 'source', 'session', state['source']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
    if (typeof state['stylePreset'] === 'string') writeStorageValue(TOOL_ID, 'stylePreset', 'local', state['stylePreset']);
    if (typeof state['customCss'] === 'string') writeStorageValue(TOOL_ID, 'customCss', 'local', state['customCss']);
  },
};
