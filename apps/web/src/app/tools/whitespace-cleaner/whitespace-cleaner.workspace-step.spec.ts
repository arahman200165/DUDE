import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './whitespace-cleaner.workspace-step';

describe('whitespace-cleaner workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and options', () => {
    workspaceStep.restore({ input: '  hi  ', options: { trim: true } });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '  hi  ', options: { trim: true } });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
