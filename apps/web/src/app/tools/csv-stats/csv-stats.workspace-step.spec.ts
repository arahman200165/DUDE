import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-stats.workspace-step';

describe('csv-stats workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/paneRatio through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a,b\n1,2', paneRatio: 0.4 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a,b\n1,2', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
