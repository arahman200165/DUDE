import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './conventional-commit-builder.workspace-step';

describe('conventional-commit-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ type: 'fix', scope: 'auth', breaking: false, subject: 'fix login bug', body: '', breakingDescription: '', footers: '' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state['subject']).toBe('fix login bug');
    expect(snapshot?.state['type']).toBe('fix');
    expect(snapshot?.summary).toContain('fix login bug');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
