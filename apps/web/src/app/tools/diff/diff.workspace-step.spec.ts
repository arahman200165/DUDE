import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './diff.workspace-step';

describe('diff workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when both sides are empty', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides and the pane ratio', () => {
    workspaceStep.restore({ left: 'a', right: 'b', paneRatio: 0.3 });
    expect(workspaceStep.snapshot()?.state).toEqual({ left: 'a', right: 'b', paneRatio: 0.3 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
