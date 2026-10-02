import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './yaml-anchors.workspace-step';

describe('yaml-anchors workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/paneRatio through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a: &x 1\nb: *x', paneRatio: 0.3 });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a: &x 1\nb: *x', paneRatio: 0.3 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
