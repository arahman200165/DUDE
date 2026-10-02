import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './dom-tree-viewer.workspace-step';

describe('dom-tree-viewer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '<div><span>hi</span></div>' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '<div><span>hi</span></div>' });
    expect(snapshot?.summary).toContain('DOM tree');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
