import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './dst-transition-explorer.workspace-step';

describe('dst-transition-explorer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ zone: 'Europe/London', year: 2027 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ zone: 'Europe/London', year: 2027 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
