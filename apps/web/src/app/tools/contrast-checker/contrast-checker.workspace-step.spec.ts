import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './contrast-checker.workspace-step';

describe('contrast-checker workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ foreground: '#111111', background: '#eeeeee' });
    expect(workspaceStep.snapshot()?.state).toEqual({ foreground: '#111111', background: '#eeeeee' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
