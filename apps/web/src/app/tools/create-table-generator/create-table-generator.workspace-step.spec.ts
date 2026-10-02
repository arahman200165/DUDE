import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './create-table-generator.workspace-step';

describe('create-table-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ sample: 'id,name\n1,a', tableName: 'people', dialect: 'mysql' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ sample: 'id,name\n1,a', tableName: 'people', dialect: 'mysql' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
