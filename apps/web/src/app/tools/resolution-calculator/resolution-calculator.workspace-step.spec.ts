import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './resolution-calculator.workspace-step';

describe('resolution-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ width: 3840, height: 2160 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ width: 3840, height: 2160 });
    expect(snapshot?.summary).toBe('Resolution: 3840×2160');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
