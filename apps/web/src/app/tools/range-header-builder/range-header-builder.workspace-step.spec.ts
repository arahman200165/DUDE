import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './range-header-builder.workspace-step';

describe('range-header-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both range fields through snapshot and restore', () => {
    workspaceStep.restore({ rangeRaw: 'bytes=0-99', contentRangeRaw: 'bytes 0-99/200' });
    expect(workspaceStep.snapshot()?.state).toEqual({ rangeRaw: 'bytes=0-99', contentRangeRaw: 'bytes 0-99/200' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
