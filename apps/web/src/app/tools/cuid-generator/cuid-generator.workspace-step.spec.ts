import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cuid-generator.workspace-step';

describe('cuid-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list through snapshot and restore', () => {
    workspaceStep.restore({ generated: ['c-abc'], count: 2, length: 10 });
    expect(workspaceStep.snapshot()?.state).toEqual({ generated: ['c-abc'], count: 2, length: 10 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
