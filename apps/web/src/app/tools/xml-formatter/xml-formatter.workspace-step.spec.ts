import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './xml-formatter.workspace-step';

describe('xml-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '<a/>', mode: 'minify', indent: 4 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '<a/>', mode: 'minify', indent: 4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
