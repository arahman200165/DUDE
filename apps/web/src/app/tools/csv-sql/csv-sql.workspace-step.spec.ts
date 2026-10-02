import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-sql.workspace-step';

describe('csv-sql workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a,b\n1,2', direction: 'sql-to-csv', tableName: 'people', paneRatio: 0.6 });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a,b\n1,2', direction: 'sql-to-csv', tableName: 'people', paneRatio: 0.6 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
