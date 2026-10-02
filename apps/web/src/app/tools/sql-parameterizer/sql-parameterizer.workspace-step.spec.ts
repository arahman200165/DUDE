import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './sql-parameterizer.workspace-step';

describe('sql-parameterizer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: "SELECT * FROM t WHERE x = 1", dialect: 'mysql', style: 'dollar' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: "SELECT * FROM t WHERE x = 1", dialect: 'mysql', style: 'dollar' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
