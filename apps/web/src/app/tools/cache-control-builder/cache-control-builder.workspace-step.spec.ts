import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cache-control-builder.workspace-step';

describe('cache-control-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw/context through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'no-store', context: 'request' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'no-store', context: 'request' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
