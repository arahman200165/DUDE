import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-flatten.workspace-step';

describe('json-flatten workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"a":{"b":1}}', direction: 'unflatten' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{"a":{"b":1}}', direction: 'unflatten' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
