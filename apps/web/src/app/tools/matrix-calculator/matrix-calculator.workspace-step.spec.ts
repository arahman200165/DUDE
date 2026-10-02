import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './matrix-calculator.workspace-step';

describe('matrix-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ op: 'add', matrixA: '1,2\n3,4', matrixB: '5,6\n7,8', scalar: '' });
    expect(workspaceStep.snapshot()?.state).toEqual({ op: 'add', matrixA: '1,2\n3,4', matrixB: '5,6\n7,8', scalar: '' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
