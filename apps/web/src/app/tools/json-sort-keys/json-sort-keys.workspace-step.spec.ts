import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-sort-keys.workspace-step';

describe('json-sort-keys workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"b":1,"a":2}', recursive: false, order: 'desc', paneRatio: 0.6 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{"b":1,"a":2}', recursive: false, order: 'desc', paneRatio: 0.6 });
    expect(snapshot?.summary).toContain('desc');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
