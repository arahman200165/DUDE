import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './xml-xpath.workspace-step';

describe('xml-xpath workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ xmlInput: '<a/>', expression: '//a', paneRatio: 0.4 });
    expect(workspaceStep.snapshot()?.state).toEqual({ xmlInput: '<a/>', expression: '//a', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
