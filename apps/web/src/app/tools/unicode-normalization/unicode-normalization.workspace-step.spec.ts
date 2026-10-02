import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './unicode-normalization.workspace-step';

describe('unicode-normalization workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and form', () => {
    workspaceStep.restore({ input: 'café', form: 'NFD' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'café', form: 'NFD' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
