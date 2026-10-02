import { WorkspaceSnapshot, WorkspaceStep } from "@dude/contracts/shared/models/workspace-step.model";
import { readStorageValue, writeStorageValue } from '../../core/workspace/workspace-storage-bridge';
import { GradientStop, GradientType, RadialShape } from "@dude/tool-engine/tools/gradient-generator/gradient-generator-logic";

const TOOL_ID = 'gradient-generator';

export const workspaceStep: WorkspaceStep = {
  historyEligible: true,

  snapshot(): WorkspaceSnapshot | undefined {
    const stops = readStorageValue<readonly GradientStop[]>(TOOL_ID, 'stops', 'session');
    if (!stops || stops.length === 0) return undefined;

    const type = readStorageValue<GradientType>(TOOL_ID, 'type', 'local') ?? 'linear';
    const angle = readStorageValue<number>(TOOL_ID, 'angle', 'local') ?? 90;
    const shape = readStorageValue<RadialShape>(TOOL_ID, 'shape', 'local') ?? 'circle';
    return { state: { type, angle, shape, stops }, summary: `${type} gradient (${stops.length} stops)` };
  },

  restore(state): void {
    if (typeof state['type'] === 'string') writeStorageValue(TOOL_ID, 'type', 'local', state['type']);
    if (typeof state['angle'] === 'number') writeStorageValue(TOOL_ID, 'angle', 'local', state['angle']);
    if (typeof state['shape'] === 'string') writeStorageValue(TOOL_ID, 'shape', 'local', state['shape']);
    if (Array.isArray(state['stops'])) writeStorageValue(TOOL_ID, 'stops', 'session', state['stops']);
  },
};
