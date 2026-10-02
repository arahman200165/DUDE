import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './sql-formatter-tool.workspace-step';

describe('sql-formatter-tool workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'SELECT 1', dialect: 'mysql', mode: 'minify' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'SELECT 1', dialect: 'mysql', mode: 'minify' });
    expect(snapshot?.summary).toContain('SELECT 1');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
