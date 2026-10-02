import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './timezone-offset-comparator.workspace-step';

describe('timezone-offset-comparator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({
      mode: 'pairwise',
      gridZonesText: '',
      gridYear: 2026,
      zoneA: 'UTC',
      zoneB: 'Europe/London',
      momentInput: '2026-01-01T09:00',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      mode: 'pairwise',
      gridZonesText: '',
      gridYear: 2026,
      zoneA: 'UTC',
      zoneB: 'Europe/London',
      momentInput: '2026-01-01T09:00',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
