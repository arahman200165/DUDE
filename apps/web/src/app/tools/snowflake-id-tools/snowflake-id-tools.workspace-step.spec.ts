import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './snowflake-id-tools.workspace-step';

describe('snowflake-id-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list through snapshot and restore', () => {
    workspaceStep.restore({
      generated: ['12345'],
      inspectInput: '',
      preset: 'discord',
      customEpoch: 0,
      customWorkerBits: 5,
      customSequenceBits: 12,
      workerId: 2,
    });

    expect(workspaceStep.snapshot()?.state).toEqual({
      generated: ['12345'],
      inspectInput: '',
      preset: 'discord',
      customEpoch: 0,
      customWorkerBits: 5,
      customSequenceBits: 12,
      workerId: 2,
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
