import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './number-theory-toolkit.workspace-step';

describe('number-theory-toolkit workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ tab: 'primes', primeInput: '997' });
    expect(workspaceStep.snapshot()?.state).toMatchObject({ tab: 'primes', primeInput: '997' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
