import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './statistics-calculator.workspace-step';

describe('statistics-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input', () => {
    workspaceStep.restore({ input: '1, 2, 3' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '1, 2, 3' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
