import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-transform-builder.workspace-step';

describe('css-transform-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    const state = { origin: 'center' };
    workspaceStep.restore({ state });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ state });
    expect(snapshot?.summary).toContain('center');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
