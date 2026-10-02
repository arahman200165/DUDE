import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './dpi-calculator.workspace-step';

describe('dpi-calculator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ mode: 'find-pixels', unit: 'cm', pixelWidth: 800, pixelHeight: 600, physicalWidth: 10, physicalHeight: 8, targetDpi: 150 });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ mode: 'find-pixels', unit: 'cm', pixelWidth: 800, pixelHeight: 600, physicalWidth: 10, physicalHeight: 8, targetDpi: 150 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
