import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './flexbox-playground.workspace-step';

describe('flexbox-playground workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips container/items through snapshot and restore', () => {
    const container = { direction: 'row' };
    const items = [{ grow: 1 }];
    workspaceStep.restore({ container, items });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ container, items });
    expect(snapshot?.summary).toContain('row');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
