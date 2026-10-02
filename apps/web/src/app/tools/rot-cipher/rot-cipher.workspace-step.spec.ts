import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './rot-cipher.workspace-step';

describe('rot-cipher workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'hi', mode: 'rot47' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'hi', mode: 'rot47' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
