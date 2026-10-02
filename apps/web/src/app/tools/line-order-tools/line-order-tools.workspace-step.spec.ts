import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './line-order-tools.workspace-step';

describe('line-order-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/operation/sortVariant', () => {
    workspaceStep.restore({ input: 'b\na', operation: 'sort', sortVariant: 'desc' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'b\na', operation: 'sort', sortVariant: 'desc' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
