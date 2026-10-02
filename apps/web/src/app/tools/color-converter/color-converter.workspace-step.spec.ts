import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './color-converter.workspace-step';

describe('color-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '#ff0000' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '#ff0000' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
