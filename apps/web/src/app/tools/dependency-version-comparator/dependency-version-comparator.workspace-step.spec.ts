import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './dependency-version-comparator.workspace-step';

describe('dependency-version-comparator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips before/after through snapshot and restore', () => {
    workspaceStep.restore({ before: '1.0.0', after: '2.0.0' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ before: '1.0.0', after: '2.0.0' });
    expect(snapshot?.summary).toContain('Dependency version comparison');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
