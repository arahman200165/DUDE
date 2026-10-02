import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './yaml-path.workspace-step';

describe('yaml-path workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ yamlInput: 'a: 1', query: '$.a', language: 'jsonpath', paneRatio: 0.4 });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ yamlInput: 'a: 1', query: '$.a', language: 'jsonpath', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
