import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'markdown-workspace';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const source = readStorageValue<string>(TOOL_ID, 'source', 'session');
    if (!source) return undefined;

    const paneRatio = readStorageValue<number>(TOOL_ID, 'paneRatio', 'local') ?? 0.5;
    const showToc = readStorageValue<boolean>(TOOL_ID, 'showToc', 'local') ?? true;
    const showFrontMatterPanel = readStorageValue<boolean>(TOOL_ID, 'showFrontMatterPanel', 'local') ?? true;
    const syncScroll = readStorageValue<boolean>(TOOL_ID, 'syncScroll', 'local') ?? true;
    const customCss = readStorageValue<string>(TOOL_ID, 'customCss', 'local') ?? '';
    const preview = source.length > 40 ? `${source.slice(0, 40)}…` : source;
    return {
      state: { source, paneRatio, showToc, showFrontMatterPanel, syncScroll, customCss },
      summary: `Markdown Workspace: "${preview}"`,
    };
  },

  restore(state): void {
    if (typeof state['source'] === 'string') writeStorageValue(TOOL_ID, 'source', 'session', state['source']);
    if (typeof state['paneRatio'] === 'number') writeStorageValue(TOOL_ID, 'paneRatio', 'local', state['paneRatio']);
    if (typeof state['showToc'] === 'boolean') writeStorageValue(TOOL_ID, 'showToc', 'local', state['showToc']);
    if (typeof state['showFrontMatterPanel'] === 'boolean') {
      writeStorageValue(TOOL_ID, 'showFrontMatterPanel', 'local', state['showFrontMatterPanel']);
    }
    if (typeof state['syncScroll'] === 'boolean') writeStorageValue(TOOL_ID, 'syncScroll', 'local', state['syncScroll']);
    if (typeof state['customCss'] === 'string') writeStorageValue(TOOL_ID, 'customCss', 'local', state['customCss']);
  },
};
