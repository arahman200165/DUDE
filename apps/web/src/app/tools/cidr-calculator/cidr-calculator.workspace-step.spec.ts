import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cidr-calculator.workspace-step';

describe('cidr-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '10.0.0.0/8' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '10.0.0.0/8' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
