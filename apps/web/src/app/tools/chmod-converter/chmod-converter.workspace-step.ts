import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { permissionsToOctal, Permissions } from "@dude/tool-engine/tools/chmod-converter/chmod-convert";

const TOOL_ID = 'chmod-converter';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const permissions = readStorageValue<Permissions>(TOOL_ID, 'permissions', 'session');
    if (!permissions) return undefined;

    return { state: { permissions }, summary: `chmod ${permissionsToOctal(permissions)}` };
  },

  restore(state): void {
    if (state['permissions'] && typeof state['permissions'] === 'object') {
      writeStorageValue(TOOL_ID, 'permissions', 'session', state['permissions']);
    }
  },
};
