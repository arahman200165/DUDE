import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-manifest-diff.workspace-step';

describe('k8s-manifest-diff workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides through snapshot and restore', () => {
    workspaceStep.restore({ before: 'a', after: 'b' });
    expect(workspaceStep.snapshot()?.state).toEqual({ before: 'a', after: 'b' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
