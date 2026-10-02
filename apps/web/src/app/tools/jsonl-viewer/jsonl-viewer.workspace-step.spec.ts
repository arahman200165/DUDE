import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './jsonl-viewer.workspace-step';

describe('jsonl-viewer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"a":1}\n{"a":2}', viewMode: 'array', paneRatio: 0.3 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{"a":1}\n{"a":2}', viewMode: 'array', paneRatio: 0.3 });
    expect(snapshot?.summary).toContain('2 lines');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
