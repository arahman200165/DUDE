import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-patch-generate.workspace-step';

describe('json-patch-generate workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both inputs through snapshot and restore', () => {
    workspaceStep.restore({ beforeInput: '{"a":1}', afterInput: '{"a":2}' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ beforeInput: '{"a":1}', afterInput: '{"a":2}' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
