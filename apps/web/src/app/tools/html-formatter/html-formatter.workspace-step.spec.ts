import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './html-formatter.workspace-step';

describe('html-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/mode through snapshot and restore', () => {
    workspaceStep.restore({ input: '<div></div>', mode: 'minify' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '<div></div>', mode: 'minify' });
    expect(snapshot?.summary).toContain('minify');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
