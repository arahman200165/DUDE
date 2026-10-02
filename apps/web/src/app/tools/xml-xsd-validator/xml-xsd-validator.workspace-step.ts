import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'xml-xsd-validator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const xmlInput = readStorageValue<string>(TOOL_ID, 'xmlInput', 'session');
    const xsdInput = readStorageValue<string>(TOOL_ID, 'xsdInput', 'session') ?? '';
    if (!xmlInput) return undefined;

    const preview = xmlInput.length > 40 ? `${xmlInput.slice(0, 40)}…` : xmlInput;
    return { state: { xmlInput, xsdInput }, summary: `XSD-validating: "${preview}"` };
  },

  restore(state): void {
    if (typeof state['xmlInput'] === 'string') writeStorageValue(TOOL_ID, 'xmlInput', 'session', state['xmlInput']);
    if (typeof state['xsdInput'] === 'string') writeStorageValue(TOOL_ID, 'xsdInput', 'session', state['xsdInput']);
  },
};
