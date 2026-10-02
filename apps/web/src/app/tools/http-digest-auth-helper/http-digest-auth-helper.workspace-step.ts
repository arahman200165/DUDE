import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'http-digest-auth-helper';

/**
 * `username`/`password` and every challenge/context field are plain in-memory signals, never
 * persisted (http-digest-auth-helper.ts never injects PersistenceService for them). Only the safe
 * method/nc/qop/algorithm preferences are mirrored; not History-eligible, since without the
 * credential this tool's state has no meaningful "operation" to log.
 */
export const workspaceStep: WorkspaceStep = {
  snapshot(): WorkspaceSnapshot | undefined {
    const method = readStorageValue<string>(TOOL_ID, 'method', 'local');
    if (!method) return undefined;

    const nc = readStorageValue<string>(TOOL_ID, 'nc', 'local') ?? '00000001';
    const qop = readStorageValue<string>(TOOL_ID, 'qop', 'local') ?? 'auth';
    const algorithm = readStorageValue<string>(TOOL_ID, 'algorithm', 'local') ?? 'MD5';
    return { state: { method, nc, qop, algorithm }, summary: `HTTP Digest Auth (${method})` };
  },

  restore(state): void {
    if (typeof state['method'] === 'string') writeStorageValue(TOOL_ID, 'method', 'local', state['method']);
    if (typeof state['nc'] === 'string') writeStorageValue(TOOL_ID, 'nc', 'local', state['nc']);
    if (typeof state['qop'] === 'string') writeStorageValue(TOOL_ID, 'qop', 'local', state['qop']);
    if (typeof state['algorithm'] === 'string') writeStorageValue(TOOL_ID, 'algorithm', 'local', state['algorithm']);
  },
};
