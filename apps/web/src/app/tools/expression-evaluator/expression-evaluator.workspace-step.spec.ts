import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './expression-evaluator.workspace-step';

describe('expression-evaluator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips expression and variables', () => {
    workspaceStep.restore({ expression: 'x + y', variables: [{ key: 'x', value: '1' }] });
    expect(workspaceStep.snapshot()?.state).toEqual({ expression: 'x + y', variables: [{ key: 'x', value: '1' }] });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
