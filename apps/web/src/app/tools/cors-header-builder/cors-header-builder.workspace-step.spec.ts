import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cors-header-builder.workspace-step';

describe('cors-header-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'Access-Control-Allow-Origin: *' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'Access-Control-Allow-Origin: *' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
