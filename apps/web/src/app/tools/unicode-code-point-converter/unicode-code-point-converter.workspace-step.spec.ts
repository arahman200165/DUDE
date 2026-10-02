import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './unicode-code-point-converter.workspace-step';

describe('unicode-code-point-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips mode and both inputs', () => {
    workspaceStep.restore({ mode: 'bulk', singleInput: 'A', bulkInput: 'A B C' });
    expect(workspaceStep.snapshot()?.state).toEqual({ mode: 'bulk', singleInput: 'A', bulkInput: 'A B C' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
