import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-dedupe.workspace-step';

describe('csv-dedupe workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a,b\n1,2\n1,2', keyColumnsInput: 'a', paneRatio: 0.4 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a,b\n1,2\n1,2', keyColumnsInput: 'a', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
