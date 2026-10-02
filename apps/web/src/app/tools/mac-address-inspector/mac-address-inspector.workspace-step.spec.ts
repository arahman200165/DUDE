import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './mac-address-inspector.workspace-step';

describe('mac-address-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '00:00:00:00:00:00' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '00:00:00:00:00:00' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
