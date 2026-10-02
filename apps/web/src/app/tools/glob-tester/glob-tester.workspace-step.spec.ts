import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './glob-tester.workspace-step';

describe('glob-tester workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ pattern: '*.ts', paths: 'a.ts', dot: true, nocase: false, treatBackslashAsSeparator: true });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ pattern: '*.ts', paths: 'a.ts', dot: true, nocase: false, treatBackslashAsSeparator: true });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
