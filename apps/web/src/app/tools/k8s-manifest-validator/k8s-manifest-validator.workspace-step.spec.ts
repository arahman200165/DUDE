import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-manifest-validator.workspace-step';

describe('k8s-manifest-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'kind: Pod' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'kind: Pod' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
