import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './base-n-encoder.workspace-step';

describe('base-n-encoder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'hi', direction: 'decode', mode: 'base32' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'hi', direction: 'decode', mode: 'base32' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
