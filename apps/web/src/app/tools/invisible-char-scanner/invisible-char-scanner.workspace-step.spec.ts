import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './invisible-char-scanner.workspace-step';

describe('invisible-char-scanner workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and stripKinds', () => {
    workspaceStep.restore({ input: 'a​b', stripKinds: ['zero-width'] });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a​b', stripKinds: ['zero-width'] });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
