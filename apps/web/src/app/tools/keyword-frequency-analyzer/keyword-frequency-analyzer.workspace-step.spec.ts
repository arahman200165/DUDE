import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './keyword-frequency-analyzer.workspace-step';

describe('keyword-frequency-analyzer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and options', () => {
    workspaceStep.restore({ input: 'the quick fox', options: { ignoreStopWords: false, minLength: 1, caseSensitive: true } });
    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'the quick fox',
      options: { ignoreStopWords: false, minLength: 1, caseSensitive: true },
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
