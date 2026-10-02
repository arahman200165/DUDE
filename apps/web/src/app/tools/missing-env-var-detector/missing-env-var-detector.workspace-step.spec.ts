import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './missing-env-var-detector.workspace-step';

describe('missing-env-var-detector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips sourceText/envText through snapshot and restore', () => {
    workspaceStep.restore({ sourceText: 'process.env.X', envText: 'X=1' });
    expect(workspaceStep.snapshot()?.state).toEqual({ sourceText: 'process.env.X', envText: 'X=1' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
