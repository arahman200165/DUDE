import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './opengraph-preview.workspace-step';

describe('opengraph-preview workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips settings through snapshot and restore', () => {
    const settings = { title: 'My Article' };
    workspaceStep.restore({ settings });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ settings });
    expect(snapshot?.summary).toContain('My Article');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
