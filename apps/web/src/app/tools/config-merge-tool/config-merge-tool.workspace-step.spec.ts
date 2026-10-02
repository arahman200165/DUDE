import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './config-merge-tool.workspace-step';

describe('config-merge-tool workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips sources through snapshot and restore', () => {
    const sources = [{ format: 'json', text: '{}' }];
    workspaceStep.restore({ sources });
    expect(workspaceStep.snapshot()?.state).toEqual({ sources });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
