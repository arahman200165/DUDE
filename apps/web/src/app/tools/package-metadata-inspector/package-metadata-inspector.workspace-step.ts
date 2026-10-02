import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { PackageEcosystem } from "@dude/tool-engine/tools/package-metadata-inspector/package-metadata-types";

const TOOL_ID = 'package-metadata-inspector';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const packageName = readStorageValue<string>(TOOL_ID, 'packageName', 'session');
    const ecosystem = readStorageValue<PackageEcosystem>(TOOL_ID, 'ecosystem', 'local') ?? 'npm';
    if (!packageName) return undefined;

    return { state: { packageName, ecosystem }, summary: `${ecosystem}: ${packageName}` };
  },

  restore(state): void {
    if (typeof state['packageName'] === 'string') writeStorageValue(TOOL_ID, 'packageName', 'session', state['packageName']);
    if (typeof state['ecosystem'] === 'string') writeStorageValue(TOOL_ID, 'ecosystem', 'local', state['ecosystem']);
  },
};
