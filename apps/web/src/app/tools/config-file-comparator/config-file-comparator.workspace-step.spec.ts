import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './config-file-comparator.workspace-step';

describe('config-file-comparator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips before/after/format through snapshot and restore', () => {
    workspaceStep.restore({ before: 'A=1', after: 'A=2', format: 'ini' });
    expect(workspaceStep.snapshot()?.state).toEqual({ before: 'A=1', after: 'A=2', format: 'ini' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
