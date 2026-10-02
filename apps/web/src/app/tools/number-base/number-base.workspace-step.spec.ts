import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './number-base.workspace-step';

describe('number-base workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ value: '4096' });
    expect(workspaceStep.snapshot()?.state).toEqual({ value: '4096' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
