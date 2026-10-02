import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './random-data-generator.workspace-step';

describe('random-data-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ selectedKeys: ['firstName', 'email'], rowCount: 25, seedInput: 'abc', outputView: 'json' });
    expect(workspaceStep.snapshot()?.state).toEqual({
      selectedKeys: ['firstName', 'email'],
      rowCount: 25,
      seedInput: 'abc',
      outputView: 'json',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
