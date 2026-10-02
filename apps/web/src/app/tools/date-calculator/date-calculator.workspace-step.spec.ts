import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './date-calculator.workspace-step';

describe('date-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({
      addStartDate: '2026-01-01',
      amount: 5,
      addMode: 'business',
      rangeStartDate: '',
      rangeEndDate: '',
      holidaysText: '',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      addStartDate: '2026-01-01',
      amount: 5,
      addMode: 'business',
      rangeStartDate: '',
      rangeEndDate: '',
      holidaysText: '',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
