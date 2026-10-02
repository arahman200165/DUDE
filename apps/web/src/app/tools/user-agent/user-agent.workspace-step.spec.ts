import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './user-agent.workspace-step';

describe('user-agent workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'Mozilla/5.0' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'Mozilla/5.0' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
