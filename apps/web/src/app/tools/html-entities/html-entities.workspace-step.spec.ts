import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './html-entities.workspace-step';

describe('html-entities workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '&amp;', mode: 'decode', encodeAllNonAscii: true });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '&amp;', mode: 'decode', encodeAllNonAscii: true });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
