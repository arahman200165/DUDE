import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './meta-tag-generator.workspace-step';

describe('meta-tag-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips settings through snapshot and restore', () => {
    const settings = { title: 'My Page' };
    workspaceStep.restore({ settings });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ settings });
    expect(snapshot?.summary).toContain('My Page');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
