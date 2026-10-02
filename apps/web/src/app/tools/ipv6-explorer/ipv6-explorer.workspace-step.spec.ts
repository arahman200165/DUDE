import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ipv6-explorer.workspace-step';

describe('ipv6-explorer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '::1' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '::1' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
