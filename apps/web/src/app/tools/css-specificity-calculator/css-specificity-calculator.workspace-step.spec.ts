import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-specificity-calculator.workspace-step';

describe('css-specificity-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input', () => {
    workspaceStep.restore({ input: '#id .class a' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '#id .class a' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
