import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-join.workspace-step';

describe('csv-join workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides through snapshot and restore', () => {
    workspaceStep.restore({ leftInput: 'a,b\n1,2', rightInput: 'a,c\n1,3', leftKey: 'a', rightKey: 'a', joinType: 'left' });
    expect(workspaceStep.snapshot()?.state).toEqual({
      leftInput: 'a,b\n1,2',
      rightInput: 'a,c\n1,3',
      leftKey: 'a',
      rightKey: 'a',
      joinType: 'left',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
