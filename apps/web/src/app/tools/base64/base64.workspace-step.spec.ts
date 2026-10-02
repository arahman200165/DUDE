import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './base64.workspace-step';

describe('base64 workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/mode through snapshot and restore', () => {
    workspaceStep.restore({ input: 'hello world', mode: 'decode' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'hello world', mode: 'decode' });
    expect(snapshot?.summary).toContain('Decoding');
    expect(snapshot?.summary).toContain('hello world');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
