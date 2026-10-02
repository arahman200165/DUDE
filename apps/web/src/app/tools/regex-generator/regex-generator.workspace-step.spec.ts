import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './regex-generator.workspace-step';

describe('regex-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips examples through snapshot and restore', () => {
    workspaceStep.restore({ examplesRaw: '2024-01-01', counterExamplesRaw: 'nope' });
    expect(workspaceStep.snapshot()?.state).toEqual({ examplesRaw: '2024-01-01', counterExamplesRaw: 'nope' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
