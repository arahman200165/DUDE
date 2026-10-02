import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-merge.workspace-step';

describe('json-merge workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both inputs through snapshot and restore', () => {
    workspaceStep.restore({ baseInput: '{"a":1}', overlayInput: '{"b":2}', strategy: 'shallow' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ baseInput: '{"a":1}', overlayInput: '{"b":2}', strategy: 'shallow' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
