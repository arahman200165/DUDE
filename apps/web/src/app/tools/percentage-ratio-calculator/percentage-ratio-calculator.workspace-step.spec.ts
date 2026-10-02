import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './percentage-ratio-calculator.workspace-step';

describe('percentage-ratio-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ tab: 'ratio', percentMode: 'of', ratioA: '4', ratioB: '3' });
    expect(workspaceStep.snapshot()?.state).toMatchObject({ tab: 'ratio', ratioA: '4', ratioB: '3' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
