import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './toml-formatter.workspace-step';

describe('toml-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a = 1', mode: 'format' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a = 1', mode: 'format' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
