import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './range-generator.workspace-step';

describe('range-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ start: '1', end: '20', step: '2', padWidth: 3, separator: 'comma' });
    expect(workspaceStep.snapshot()?.state).toEqual({ start: '1', end: '20', step: '2', padWidth: 3, separator: 'comma' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
