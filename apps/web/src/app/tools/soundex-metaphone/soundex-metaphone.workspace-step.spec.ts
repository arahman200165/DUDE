import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './soundex-metaphone.workspace-step';

describe('soundex-metaphone workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input', () => {
    workspaceStep.restore({ input: 'Robert' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'Robert' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
