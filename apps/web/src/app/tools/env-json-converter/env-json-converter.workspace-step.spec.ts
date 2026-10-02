import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './env-json-converter.workspace-step';

describe('env-json-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/direction through snapshot and restore', () => {
    workspaceStep.restore({ input: 'FOO=bar', direction: 'json-to-env' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'FOO=bar', direction: 'json-to-env' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
