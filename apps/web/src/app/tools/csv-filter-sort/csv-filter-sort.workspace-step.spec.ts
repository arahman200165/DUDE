import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-filter-sort.workspace-step';

describe('csv-filter-sort workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({
      input: 'a,b\n1,2',
      filterColumn: 'a',
      operator: 'equals',
      filterValue: '1',
      sortColumn: 'b',
      sortDirection: 'desc',
    });
    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'a,b\n1,2',
      filterColumn: 'a',
      operator: 'equals',
      filterValue: '1',
      sortColumn: 'b',
      sortDirection: 'desc',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
