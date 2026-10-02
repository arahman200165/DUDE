import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-grid-playground.workspace-step';

describe('css-grid-playground workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips container/items through snapshot and restore', () => {
    const container = { columns: 3, rows: 2 };
    const items = [{ column: '1 / 2', row: '1 / 2' }];
    workspaceStep.restore({ container, items });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ container, items });
    expect(snapshot?.summary).toContain('3');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
