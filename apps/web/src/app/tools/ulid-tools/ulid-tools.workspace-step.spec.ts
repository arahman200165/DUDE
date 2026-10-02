import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ulid-tools.workspace-step';

describe('ulid-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list through snapshot and restore', () => {
    workspaceStep.restore({ generated: ['01ABC'], inspectInput: '', monotonic: true });
    expect(workspaceStep.snapshot()?.state).toEqual({ generated: ['01ABC'], inspectInput: '', monotonic: true });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
