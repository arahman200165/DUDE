import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './find-replace-text.workspace-step';

describe('find-replace-text workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields', () => {
    workspaceStep.restore({ input: 'a b a', find: 'a', replace: 'x', caseSensitive: false, wholeWord: true });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a b a', find: 'a', replace: 'x', caseSensitive: false, wholeWord: true });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
