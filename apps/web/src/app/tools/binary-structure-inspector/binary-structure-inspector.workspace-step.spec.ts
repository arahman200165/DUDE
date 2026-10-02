import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './binary-structure-inspector.workspace-step';

describe('binary-structure-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips the field schema through snapshot and restore', () => {
    const fields = [{ name: 'magic', type: 'uint32', length: 0, endianness: 'LE' }];
    workspaceStep.restore({ fields });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ fields });
    expect(snapshot?.summary).toContain('magic');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
