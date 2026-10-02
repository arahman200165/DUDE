import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-patch-test.workspace-step';

describe('json-patch-test workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both inputs through snapshot and restore', () => {
    workspaceStep.restore({ documentInput: '{"a":1}', patchInput: '[{"op":"remove","path":"/a"}]' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ documentInput: '{"a":1}', patchInput: '[{"op":"remove","path":"/a"}]' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
