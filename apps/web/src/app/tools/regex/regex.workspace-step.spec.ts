import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './regex.workspace-step';

describe('regex workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ pattern: '\\d+', testText: '123', flags: 'gi', mode: 'replace', replacement: 'X', flavor: 'python' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ pattern: '\\d+', testText: '123', flags: 'gi', mode: 'replace', replacement: 'X', flavor: 'python' });
    expect(snapshot?.summary).toContain('replace');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
