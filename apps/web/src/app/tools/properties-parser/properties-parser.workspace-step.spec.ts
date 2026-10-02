import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './properties-parser.workspace-step';

describe('properties-parser workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a=1', direction: 'json-to-properties', paneRatio: 0.5 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a=1', direction: 'json-to-properties', paneRatio: 0.5 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
