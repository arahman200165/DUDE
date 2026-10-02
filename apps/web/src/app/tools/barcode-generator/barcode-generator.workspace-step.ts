import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { BarcodeFormat } from "@dude/tool-engine/tools/barcode-generator/barcode-validate";

const TOOL_ID = 'barcode-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const value = readStorageValue<string>(TOOL_ID, 'value', 'session');
    if (!value) return undefined;
    const format = readStorageValue<BarcodeFormat>(TOOL_ID, 'format', 'local') ?? 'CODE128';
    return { state: { format, value }, summary: `${format} barcode: "${value}"` };
  },

  restore(state): void {
    if (typeof state['format'] === 'string') writeStorageValue(TOOL_ID, 'format', 'local', state['format']);
    if (typeof state['value'] === 'string') writeStorageValue(TOOL_ID, 'value', 'session', state['value']);
  },
};
