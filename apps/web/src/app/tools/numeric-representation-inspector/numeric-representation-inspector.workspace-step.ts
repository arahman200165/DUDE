import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';

const TOOL_ID = 'numeric-representation-inspector';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const tab = readStorageValue<string>(TOOL_ID, 'tab', 'local') ?? 'endianness';
    const endiannessInput = readStorageValue<string>(TOOL_ID, 'endiannessInput', 'session');
    const floatInput = readStorageValue<string>(TOOL_ID, 'floatInput', 'session');
    const integerInput = readStorageValue<string>(TOOL_ID, 'integerInput', 'session');
    if (!endiannessInput && !floatInput && !integerInput) return undefined;

    const state = {
      tab,
      endiannessInput: endiannessInput ?? '',
      endiannessWidth: readStorageValue<number>(TOOL_ID, 'endiannessWidth', 'local') ?? 32,
      floatInput: floatInput ?? '',
      floatPrecision: readStorageValue<number>(TOOL_ID, 'floatPrecision', 'local') ?? 32,
      integerInput: integerInput ?? '',
    };
    return { state, summary: `Numeric representation (${tab})` };
  },

  restore(state): void {
    if (typeof state['tab'] === 'string') writeStorageValue(TOOL_ID, 'tab', 'local', state['tab']);
    if (typeof state['endiannessInput'] === 'string') writeStorageValue(TOOL_ID, 'endiannessInput', 'session', state['endiannessInput']);
    if (typeof state['endiannessWidth'] === 'number') writeStorageValue(TOOL_ID, 'endiannessWidth', 'local', state['endiannessWidth']);
    if (typeof state['floatInput'] === 'string') writeStorageValue(TOOL_ID, 'floatInput', 'session', state['floatInput']);
    if (typeof state['floatPrecision'] === 'number') writeStorageValue(TOOL_ID, 'floatPrecision', 'local', state['floatPrecision']);
    if (typeof state['integerInput'] === 'string') writeStorageValue(TOOL_ID, 'integerInput', 'session', state['integerInput']);
  },
};
