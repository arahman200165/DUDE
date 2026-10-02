import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'url-normalizer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const mode = readStorageValue<'normalize' | 'resolve' | 'compare'>(TOOL_ID, 'mode', 'local') ?? 'normalize';
    const normalizeInput = readStorageValue<string>(TOOL_ID, 'normalizeInput', 'session') ?? '';
    const resolveBase = readStorageValue<string>(TOOL_ID, 'resolveBase', 'session') ?? '';
    const resolveRelative = readStorageValue<string>(TOOL_ID, 'resolveRelative', 'session') ?? '';
    const compareA = readStorageValue<string>(TOOL_ID, 'compareA', 'session') ?? '';
    const compareB = readStorageValue<string>(TOOL_ID, 'compareB', 'session') ?? '';
    if (!normalizeInput && !resolveRelative && !compareA) return undefined;

    const sortQueryParams = readStorageValue<boolean>(TOOL_ID, 'sortQueryParams', 'local') ?? false;
    const stripTrailingSlash = readStorageValue<boolean>(TOOL_ID, 'stripTrailingSlash', 'local') ?? false;
    const stripFragment = readStorageValue<boolean>(TOOL_ID, 'stripFragment', 'local') ?? false;

    return {
      state: { mode, normalizeInput, resolveBase, resolveRelative, compareA, compareB, sortQueryParams, stripTrailingSlash, stripFragment },
      summary: `URL Normalizer (${mode})`,
    };
  },

  restore(state): void {
    if (state['mode'] === 'normalize' || state['mode'] === 'resolve' || state['mode'] === 'compare') {
      writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
    }
    if (typeof state['normalizeInput'] === 'string') writeStorageValue(TOOL_ID, 'normalizeInput', 'session', state['normalizeInput']);
    if (typeof state['resolveBase'] === 'string') writeStorageValue(TOOL_ID, 'resolveBase', 'session', state['resolveBase']);
    if (typeof state['resolveRelative'] === 'string') writeStorageValue(TOOL_ID, 'resolveRelative', 'session', state['resolveRelative']);
    if (typeof state['compareA'] === 'string') writeStorageValue(TOOL_ID, 'compareA', 'session', state['compareA']);
    if (typeof state['compareB'] === 'string') writeStorageValue(TOOL_ID, 'compareB', 'session', state['compareB']);
    if (typeof state['sortQueryParams'] === 'boolean') writeStorageValue(TOOL_ID, 'sortQueryParams', 'local', state['sortQueryParams']);
    if (typeof state['stripTrailingSlash'] === 'boolean') writeStorageValue(TOOL_ID, 'stripTrailingSlash', 'local', state['stripTrailingSlash']);
    if (typeof state['stripFragment'] === 'boolean') writeStorageValue(TOOL_ID, 'stripFragment', 'local', state['stripFragment']);
  },
};
