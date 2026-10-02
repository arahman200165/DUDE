import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'cookie-tools';

/**
 * `cookieRaw`/`setCookieRaw` are deliberately unpersisted (session tokens) — see cookie-tools.ts's
 * own doc comment. Only the safe `mode` preference is mirrored; not History-eligible since there's
 * nothing meaningful left to log once the sensitive fields are excluded.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const mode = readStorageValue<'cookie' | 'set-cookie'>(TOOL_ID, 'mode', 'local');
    if (!mode) return undefined;
    return { state: { mode }, summary: `Cookie Tools (${mode})` };
  },

  restore(state): void {
    if (state['mode'] === 'cookie' || state['mode'] === 'set-cookie') writeStorageValue(TOOL_ID, 'mode', 'local', state['mode']);
  },
};
