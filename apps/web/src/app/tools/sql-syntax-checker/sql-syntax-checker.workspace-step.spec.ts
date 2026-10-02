import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './sql-syntax-checker.workspace-step';

describe('sql-syntax-checker workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'SELECT 1', dialect: 'mysql' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'SELECT 1', dialect: 'mysql' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
