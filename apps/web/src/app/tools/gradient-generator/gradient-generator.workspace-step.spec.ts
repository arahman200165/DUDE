import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './gradient-generator.workspace-step';

describe('gradient-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    const stops = [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 100 }];
    workspaceStep.restore({ type: 'radial', angle: 45, shape: 'ellipse', stops });
    expect(workspaceStep.snapshot()?.state).toEqual({ type: 'radial', angle: 45, shape: 'ellipse', stops });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
