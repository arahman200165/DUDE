import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cron.workspace-step';

describe('cron workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ expression: '0 9 * * 1', occurrenceCount: 10, tzMode: 'utc', direction: 'previous' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ expression: '0 9 * * 1', occurrenceCount: 10, tzMode: 'utc', direction: 'previous' });
    expect(snapshot?.summary).toBe('Cron: "0 9 * * 1"');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
