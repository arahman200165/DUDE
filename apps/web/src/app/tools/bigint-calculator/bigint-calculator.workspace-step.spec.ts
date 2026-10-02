import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './bigint-calculator.workspace-step';

describe('bigint-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ op: 'mul', inputA: '99999999999999999999', inputB: '2' });
    expect(workspaceStep.snapshot()?.state).toEqual({ op: 'mul', inputA: '99999999999999999999', inputB: '2' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
