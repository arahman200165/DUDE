import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './yaml-json.workspace-step';

describe('yaml-json workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a: 1', direction: 'json-to-yaml', indent: 4 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a: 1', direction: 'json-to-yaml', indent: 4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
