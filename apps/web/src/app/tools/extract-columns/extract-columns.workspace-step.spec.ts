import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './extract-columns.workspace-step';

describe('extract-columns workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields', () => {
    workspaceStep.restore({ input: 'a,b,c', delimiter: ',', columnSpec: '1,3', outputDelimiter: ';' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a,b,c', delimiter: ',', columnSpec: '1,3', outputDelimiter: ';' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
