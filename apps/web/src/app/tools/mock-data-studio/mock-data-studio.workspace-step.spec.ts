import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './mock-data-studio.workspace-step';

describe('mock-data-studio workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips schema and options through snapshot and restore', () => {
    workspaceStep.restore({ schema: '{"a":"1"}', rowCount: 5, seed: '42', tableName: 'people', exportFormat: 'csv' });
    expect(workspaceStep.snapshot()?.state).toEqual({ schema: '{"a":"1"}', rowCount: 5, seed: '42', tableName: 'people', exportFormat: 'csv' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
