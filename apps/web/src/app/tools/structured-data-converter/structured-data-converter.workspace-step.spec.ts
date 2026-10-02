import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './structured-data-converter.workspace-step';

describe('structured-data-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"a":1}', fromFormat: 'json', toFormat: 'toml', paneRatio: 0.4 });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '{"a":1}', fromFormat: 'json', toFormat: 'toml', paneRatio: 0.4 });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
