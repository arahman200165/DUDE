import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './aspect-ratio-calculator.workspace-step';

describe('aspect-ratio-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ mode: 'solve', solveFor: 'width', width: 1280, height: 720, targetRatio: '4:3', knownDimension: 720 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ mode: 'solve', solveFor: 'width', width: 1280, height: 720, targetRatio: '4:3', knownDimension: 720 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
