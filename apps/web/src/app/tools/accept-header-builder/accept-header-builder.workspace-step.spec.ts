import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './accept-header-builder.workspace-step';

describe('accept-header-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'application/json' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'application/json' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
