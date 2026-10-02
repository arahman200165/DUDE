import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './box-shadow-generator.workspace-step';

describe('box-shadow-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips layers', () => {
    const layers = [{ x: 0, y: 4, blur: 8, spread: 0, color: '#000' }];
    workspaceStep.restore({ layers });
    expect(workspaceStep.snapshot()?.state).toEqual({ layers });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
