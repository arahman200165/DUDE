import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './file-base64.workspace-step';

describe('file-base64 workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'encode', input: '', output: 'aGVsbG8=', filename: 'a.bin' });
    expect(workspaceStep.snapshot()?.state).toEqual({ direction: 'encode', input: '', output: 'aGVsbG8=', filename: 'a.bin' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
