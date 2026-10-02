import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './timezone-converter.workspace-step';

describe('timezone-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ date: '2026-01-01', time: '09:00', sourceZone: 'UTC', targetZones: ['UTC', 'America/New_York'] });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ date: '2026-01-01', time: '09:00', sourceZone: 'UTC', targetZones: ['UTC', 'America/New_York'] });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
