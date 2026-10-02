import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './programmer-calculator.workspace-step';

describe('programmer-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ width: 64, op: 'or', inputA: '5', inputB: '3' });
    expect(workspaceStep.snapshot()?.state).toEqual({ width: 64, op: 'or', inputA: '5', inputB: '3' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
