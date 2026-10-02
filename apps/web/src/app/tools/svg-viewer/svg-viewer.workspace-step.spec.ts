import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './svg-viewer.workspace-step';

describe('svg-viewer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ source: '<svg></svg>', mode: 'minify' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ source: '<svg></svg>', mode: 'minify' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
