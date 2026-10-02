import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './numeric-representation-inspector.workspace-step';

describe('numeric-representation-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({
      tab: 'ieee754',
      endiannessInput: '1',
      endiannessWidth: 16,
      floatInput: '3.14',
      floatPrecision: 64,
      integerInput: '-2',
    });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      tab: 'ieee754',
      endiannessInput: '1',
      endiannessWidth: 16,
      floatInput: '3.14',
      floatPrecision: 64,
      integerInput: '-2',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
