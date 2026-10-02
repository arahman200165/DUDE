import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-query.workspace-step';

describe('json-query workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ jsonInput: '{"a":1}', query: '$.a', language: 'jsonpath' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ jsonInput: '{"a":1}', query: '$.a', language: 'jsonpath' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
