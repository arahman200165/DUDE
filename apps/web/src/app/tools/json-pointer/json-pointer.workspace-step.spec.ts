import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-pointer.workspace-step';

describe('json-pointer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ jsonInput: '{"a":1}', pointer: '/a', paneRatio: 0.4 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ jsonInput: '{"a":1}', pointer: '/a', paneRatio: 0.4 });
    expect(snapshot?.summary).toContain('/a');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
