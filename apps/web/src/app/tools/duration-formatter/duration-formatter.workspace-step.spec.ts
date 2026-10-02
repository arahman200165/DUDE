import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './duration-formatter.workspace-step';

describe('duration-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '2h 15m' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '2h 15m' });
    expect(snapshot?.summary).toBe('Duration: "2h 15m"');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
