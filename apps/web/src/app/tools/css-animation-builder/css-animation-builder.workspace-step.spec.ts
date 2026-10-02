import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-animation-builder.workspace-step';

describe('css-animation-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips settings/stops through snapshot and restore', () => {
    const settings = { name: 'spin', durationSeconds: 2 };
    const stops = [{ offset: 0, transform: 'rotate(0deg)' }];
    workspaceStep.restore({ settings, stops });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ settings, stops });
    expect(snapshot?.summary).toContain('spin');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
