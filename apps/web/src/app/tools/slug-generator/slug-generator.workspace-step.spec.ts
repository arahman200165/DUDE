import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './slug-generator.workspace-step';

describe('slug-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and options', () => {
    workspaceStep.restore({ input: 'Hello World', options: { separator: 'hyphen', maxLength: null, removeStopwords: false } });
    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'Hello World',
      options: { separator: 'hyphen', maxLength: null, removeStopwords: false },
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
