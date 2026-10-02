import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './commit-message-validator.workspace-step';

describe('commit-message-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips message through snapshot and restore', () => {
    workspaceStep.restore({ message: 'fix: bug' });
    expect(workspaceStep.snapshot()?.state).toEqual({ message: 'fix: bug' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
