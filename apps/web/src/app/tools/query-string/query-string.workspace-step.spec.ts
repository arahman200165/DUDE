import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './query-string.workspace-step';

describe('query-string workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'a=1&b=2' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'a=1&b=2' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
