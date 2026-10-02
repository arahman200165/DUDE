import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './gitignore-tester.workspace-step';

describe('gitignore-tester workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both fields through snapshot and restore', () => {
    workspaceStep.restore({ gitignore: '*.log', paths: 'a.log\nb.ts' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ gitignore: '*.log', paths: 'a.log\nb.ts' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
