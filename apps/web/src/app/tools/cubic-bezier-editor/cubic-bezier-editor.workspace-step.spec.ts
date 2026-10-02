import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cubic-bezier-editor.workspace-step';

describe('cubic-bezier-editor workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips points through snapshot and restore', () => {
    const points = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    workspaceStep.restore({ points });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ points });
    expect(snapshot?.summary).toContain('cubic-bezier');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
