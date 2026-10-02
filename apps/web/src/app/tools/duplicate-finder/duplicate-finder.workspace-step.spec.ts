import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './duplicate-finder.workspace-step';

describe('duplicate-finder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/mode/caseSensitive', () => {
    workspaceStep.restore({ input: 'a\na\nb', mode: 'words', caseSensitive: false });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a\na\nb', mode: 'words', caseSensitive: false });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
