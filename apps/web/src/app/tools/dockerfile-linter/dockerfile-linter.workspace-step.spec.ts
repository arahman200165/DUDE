import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './dockerfile-linter.workspace-step';

describe('dockerfile-linter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'FROM node' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'FROM node' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
