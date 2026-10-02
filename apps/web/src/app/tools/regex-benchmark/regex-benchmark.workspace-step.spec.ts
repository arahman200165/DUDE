import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './regex-benchmark.workspace-step';

describe('regex-benchmark workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ pattern: '(a+)+$', flags: '', samplesRaw: 'aaa', timeoutMs: 500 });
    expect(workspaceStep.snapshot()?.state).toEqual({ pattern: '(a+)+$', flags: '', samplesRaw: 'aaa', timeoutMs: 500 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
