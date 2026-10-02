import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './url-encode.workspace-step';

describe('url-encode workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'hello world', operation: 'decode', variant: 'full' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'hello world', operation: 'decode', variant: 'full' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
