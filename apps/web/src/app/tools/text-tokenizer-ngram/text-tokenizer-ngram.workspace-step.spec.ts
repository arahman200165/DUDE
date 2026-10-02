import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './text-tokenizer-ngram.workspace-step';

describe('text-tokenizer-ngram workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields', () => {
    workspaceStep.restore({ input: 'the quick fox', mode: 'ngram', granularity: 'char', ngramLevel: 'char', n: 3 });
    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'the quick fox',
      mode: 'ngram',
      granularity: 'char',
      ngramLevel: 'char',
      n: 3,
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
