import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-pivot.workspace-step';

describe('csv-pivot workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a,b,c\n1,2,3', rowKeyColumn: 'a', columnKeyColumn: 'b', valueColumn: 'c', aggregation: 'avg' });
    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'a,b,c\n1,2,3',
      rowKeyColumn: 'a',
      columnKeyColumn: 'b',
      valueColumn: 'c',
      aggregation: 'avg',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
