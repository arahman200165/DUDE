import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './branch-name-generator.workspace-step';

describe('branch-name-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ type: 'bugfix', ticket: 'JIRA-1', description: 'fix login', maxLength: 40 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ type: 'bugfix', ticket: 'JIRA-1', description: 'fix login', maxLength: 40 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
