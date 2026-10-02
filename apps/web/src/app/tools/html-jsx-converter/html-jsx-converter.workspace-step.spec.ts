import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './html-jsx-converter.workspace-step';

describe('html-jsx-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/direction through snapshot and restore', () => {
    workspaceStep.restore({ input: '<div class="a"></div>', direction: 'html-to-jsx' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '<div class="a"></div>', direction: 'html-to-jsx' });
    expect(snapshot?.summary).toContain('html-to-jsx');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
