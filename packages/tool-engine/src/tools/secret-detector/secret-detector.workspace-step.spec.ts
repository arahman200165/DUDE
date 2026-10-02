import { describe, expect, it } from 'vitest';
import { workspaceStep } from "./secret-detector.workspace-step.js";
import { consumeWorkspaceState } from "../../core/workspace/workspace-handoff.js";

describe('secret-detector workspaceStep', () => {
  it('never reads storage (no snapshot)', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });

  it('restore hands the input off in-memory rather than writing storage', () => {
    workspaceStep.restore({ input: 'AKIA-fake-key' });
    expect(localStorage.getItem('dude:v1:secret-detector:input')).toBeNull();
    expect(consumeWorkspaceState('secret-detector')).toEqual({ input: 'AKIA-fake-key' });
  });
});
