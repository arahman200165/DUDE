import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './string-similarity-calculator.workspace-step';

describe('string-similarity-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when both sides are empty', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides', () => {
    workspaceStep.restore({ left: 'kitten', right: 'sitting' });
    expect(workspaceStep.snapshot()?.state).toEqual({ left: 'kitten', right: 'sitting' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
