import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './git-remote-inspector.workspace-step';

describe('git-remote-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'origin\turl (fetch)' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'origin\turl (fetch)' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
