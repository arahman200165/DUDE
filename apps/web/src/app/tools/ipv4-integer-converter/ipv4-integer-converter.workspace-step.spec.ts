import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ipv4-integer-converter.workspace-step';

describe('ipv4-integer-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'int-to-ip', input: '3232235777' });
    expect(workspaceStep.snapshot()?.state).toEqual({ direction: 'int-to-ip', input: '3232235777' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
