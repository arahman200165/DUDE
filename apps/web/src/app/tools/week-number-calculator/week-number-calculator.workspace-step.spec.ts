import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './week-number-calculator.workspace-step';

describe('week-number-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ dateInput: '2026-03-05', weekYearInput: 2026, weekNumberInput: 10, weekdayInput: 3 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ dateInput: '2026-03-05', weekYearInput: 2026, weekNumberInput: 10, weekdayInput: 3 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
