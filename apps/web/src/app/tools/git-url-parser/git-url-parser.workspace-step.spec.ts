import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './git-url-parser.workspace-step';

describe('git-url-parser workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'git@github.com:a/b.git' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'git@github.com:a/b.git' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
