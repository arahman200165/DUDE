import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './recurrence-rule.workspace-step';

describe('recurrence-rule workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ startDate: '2026-01-01', startTime: '09:00', ruleText: 'FREQ=DAILY;COUNT=5', timezone: 'UTC', maxOccurrences: 5 });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ startDate: '2026-01-01', startTime: '09:00', ruleText: 'FREQ=DAILY;COUNT=5', timezone: 'UTC', maxOccurrences: 5 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
