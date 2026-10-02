import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-quantity-converter.workspace-step';

describe('k8s-quantity-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '2Gi' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '2Gi' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
