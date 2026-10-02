import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './git-command-explainer.workspace-step';

describe('git-command-explainer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'git status' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'git status' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
