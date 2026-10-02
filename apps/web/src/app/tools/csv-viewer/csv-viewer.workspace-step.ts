import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { type CsvDelimiter, type CsvDirection } from "@dude/tool-engine/tools/csv-viewer/csv-convert";

const TOOL_ID = 'csv-viewer';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>(TOOL_ID, 'input', 'session');
    if (!input) return undefined;
    const direction = readStorageValue<CsvDirection>(TOOL_ID, 'direction', 'local') ?? 'csv-to-json';
    const delimiter = readStorageValue<CsvDelimiter>(TOOL_ID, 'delimiter', 'local') ?? ',';
    const hasHeaderRow = readStorageValue<boolean>(TOOL_ID, 'hasHeaderRow', 'local') ?? true;
    const preview = input.length > 40 ? `${input.slice(0, 40)}…` : input;
    return { state: { input, direction, delimiter, hasHeaderRow }, summary: `${direction}: "${preview}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue(TOOL_ID, 'input', 'session', state['input']);
    if (typeof state['direction'] === 'string') writeStorageValue(TOOL_ID, 'direction', 'local', state['direction']);
    if (typeof state['delimiter'] === 'string') writeStorageValue(TOOL_ID, 'delimiter', 'local', state['delimiter']);
    if (typeof state['hasHeaderRow'] === 'boolean') writeStorageValue(TOOL_ID, 'hasHeaderRow', 'local', state['hasHeaderRow']);
  },
};
