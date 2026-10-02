import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './tailwind-color-matcher.workspace-step';

describe('tailwind-color-matcher workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '#ff0000' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '#ff0000' });
    expect(snapshot?.summary).toContain('#ff0000');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
