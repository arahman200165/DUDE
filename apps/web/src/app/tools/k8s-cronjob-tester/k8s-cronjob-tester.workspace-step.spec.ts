import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-cronjob-tester.workspace-step';

describe('k8s-cronjob-tester workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'schedule: "* * * * *"', count: 10 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'schedule: "* * * * *"', count: 10 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
