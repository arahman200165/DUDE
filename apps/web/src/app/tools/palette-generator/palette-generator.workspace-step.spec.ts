import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './palette-generator.workspace-step';

describe('palette-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '#00ff00', type: 'triadic' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '#00ff00', type: 'triadic' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
