import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './package-metadata-inspector.workspace-step';

describe('package-metadata-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips packageName/ecosystem through snapshot and restore', () => {
    workspaceStep.restore({ packageName: 'lodash', ecosystem: 'npm' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ packageName: 'lodash', ecosystem: 'npm' });
    expect(snapshot?.summary).toContain('lodash');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
