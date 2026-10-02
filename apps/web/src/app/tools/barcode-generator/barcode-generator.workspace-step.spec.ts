import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './barcode-generator.workspace-step';

describe('barcode-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips format/value through snapshot and restore', () => {
    workspaceStep.restore({ format: 'EAN13', value: '4006381333931' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ format: 'EAN13', value: '4006381333931' });
    expect(snapshot?.summary).toContain('EAN13');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
