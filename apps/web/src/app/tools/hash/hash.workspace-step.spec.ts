import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './hash.workspace-step';

describe('hash workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips text/algorithms through snapshot and restore', () => {
    workspaceStep.restore({ text: 'hello', algorithms: ['SHA-256', 'MD5'] });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ text: 'hello', algorithms: ['SHA-256', 'MD5'] });
    expect(snapshot?.summary).toContain('SHA-256, MD5');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
