import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './unix-timestamp.workspace-step';

describe('unix-timestamp workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ timestampInput: '1700000000', dateInput: '', unit: 'seconds', tz: 'utc' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ timestampInput: '1700000000', dateInput: '', unit: 'seconds', tz: 'utc' });
    expect(snapshot?.summary).toContain('1700000000');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
