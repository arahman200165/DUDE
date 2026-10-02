import { describe, expect, it } from 'vitest';
import { workspaceStep } from "./kubeconfig-inspector.workspace-step.js";
import { consumeWorkspaceState } from "../../core/workspace/workspace-handoff.js";

describe('kubeconfig-inspector workspaceStep', () => {
  it('never reads storage (no snapshot)', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });

  it('restore hands the input off in-memory rather than writing storage', () => {
    workspaceStep.restore({ input: 'apiVersion: v1' });
    expect(localStorage.getItem('dude:v1:kubeconfig-inspector:input')).toBeNull();
    expect(consumeWorkspaceState('kubeconfig-inspector')).toEqual({ input: 'apiVersion: v1' });
  });
});
