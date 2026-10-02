import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './semver-comparator.workspace-step';

describe('semver-comparator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips versionA/versionB through snapshot and restore', () => {
    workspaceStep.restore({ tab: 'compare', versionA: '1.0.0', versionB: '2.0.0' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state['versionA']).toBe('1.0.0');
    expect(snapshot?.state['versionB']).toBe('2.0.0');
    expect(snapshot?.summary).toContain('compare');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
