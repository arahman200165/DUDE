import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csv-viewer.workspace-step';

describe('csv-viewer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a,b\n1,2', direction: 'json-to-csv', delimiter: ';', hasHeaderRow: false });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'a,b\n1,2', direction: 'json-to-csv', delimiter: ';', hasHeaderRow: false });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
