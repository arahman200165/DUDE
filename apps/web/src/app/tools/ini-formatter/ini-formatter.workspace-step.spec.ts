import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ini-formatter.workspace-step';

describe('ini-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '[a]\nb=1', direction: 'json-to-ini', paneRatio: 0.5 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '[a]\nb=1', direction: 'json-to-ini', paneRatio: 0.5 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
