import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-resource-calculator.workspace-step';

describe('k8s-resource-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'spec: {}' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'spec: {}' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
