import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './regex-visualizer.workspace-step';

describe('regex-visualizer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips pattern/flags through snapshot and restore', () => {
    workspaceStep.restore({ pattern: '^a+$', flags: 'i' });
    expect(workspaceStep.snapshot()?.state).toEqual({ pattern: '^a+$', flags: 'i' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
