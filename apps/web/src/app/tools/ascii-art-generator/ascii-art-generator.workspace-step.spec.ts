import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ascii-art-generator.workspace-step';

describe('ascii-art-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and font', () => {
    workspaceStep.restore({ input: 'HI', font: 'Slant' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'HI', font: 'Slant' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
