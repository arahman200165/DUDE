import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './subnet-calculator.workspace-step';

describe('subnet-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ base: '10.0.0.0/8', mode: 'size', param: 256 });
    expect(workspaceStep.snapshot()?.state).toEqual({ base: '10.0.0.0/8', mode: 'size', param: 256 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
