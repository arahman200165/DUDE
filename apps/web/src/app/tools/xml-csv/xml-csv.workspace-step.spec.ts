import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './xml-csv.workspace-step';

describe('xml-csv workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ input: '<a/>', direction: 'csv-to-xml', recordElement: 'row', paneRatio: 0.4 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '<a/>', direction: 'csv-to-xml', recordElement: 'row', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
