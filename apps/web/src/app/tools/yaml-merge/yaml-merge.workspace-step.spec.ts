import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './yaml-merge.workspace-step';

describe('yaml-merge workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both inputs through snapshot and restore', () => {
    workspaceStep.restore({ baseInput: 'a: 1', overlayInput: 'a: 2' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ baseInput: 'a: 1', overlayInput: 'a: 2' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
