import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import type { UuidVersion } from "@dude/tool-engine/tools/uuid/uuid-tool";
import type { UuidExportFormat } from "@dude/tool-engine/tools/uuid/uuid-export";

const TOOL_ID = 'uuid';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const generated = readStorageValue<readonly string[]>(TOOL_ID, 'generated', 'session') ?? [];
    const inspectInput = readStorageValue<string>(TOOL_ID, 'inspect', 'session') ?? '';
    if (generated.length === 0 && !inspectInput) return undefined;

    const version = readStorageValue<UuidVersion>(TOOL_ID, 'version', 'local') ?? 'v4';
    const exportFormat = readStorageValue<UuidExportFormat>(TOOL_ID, 'exportFormat', 'local') ?? 'txt';
    const namespaceChoice = readStorageValue<string>(TOOL_ID, 'namespaceChoice', 'session') ?? 'DNS';
    const customNamespace = readStorageValue<string>(TOOL_ID, 'customNamespace', 'session') ?? '';
    const name = readStorageValue<string>(TOOL_ID, 'name', 'session') ?? '';

    const summary = generated.length > 0 ? `Generated ${generated.length} UUID(s), latest ${generated[0]}` : `Inspecting UUID "${inspectInput}"`;
    return { state: { generated, inspectInput, version, exportFormat, namespaceChoice, customNamespace, name }, summary };
  },

  restore(state): void {
    if (Array.isArray(state['generated'])) writeStorageValue(TOOL_ID, 'generated', 'session', state['generated']);
    if (typeof state['inspectInput'] === 'string') writeStorageValue(TOOL_ID, 'inspect', 'session', state['inspectInput']);
    if (typeof state['version'] === 'string') writeStorageValue(TOOL_ID, 'version', 'local', state['version']);
    if (typeof state['exportFormat'] === 'string') writeStorageValue(TOOL_ID, 'exportFormat', 'local', state['exportFormat']);
    if (typeof state['namespaceChoice'] === 'string') writeStorageValue(TOOL_ID, 'namespaceChoice', 'session', state['namespaceChoice']);
    if (typeof state['customNamespace'] === 'string') writeStorageValue(TOOL_ID, 'customNamespace', 'session', state['customNamespace']);
    if (typeof state['name'] === 'string') writeStorageValue(TOOL_ID, 'name', 'session', state['name']);
  },
};
