import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './scientific-notation-converter.workspace-step';

describe('scientific-notation-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '1.5e10', precision: 3 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '1.5e10', precision: 3 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
