import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './url-percent-inspector.workspace-step';

describe('url-percent-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a%20b' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a%20b' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
