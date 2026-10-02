import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './hex-dump.workspace-step';

describe('hex-dump workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'toHexDump', dumpInput: '', dumpOutput: '00 01', filename: 'a.bin' });
    expect(workspaceStep.snapshot()?.state).toEqual({ direction: 'toHexDump', dumpInput: '', dumpOutput: '00 01', filename: 'a.bin' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
