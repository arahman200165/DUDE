import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './env-validator.workspace-step';

describe('env-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ envText: 'PORT=1', rulesText: 'PORT:number' });
    expect(workspaceStep.snapshot()?.state).toEqual({ envText: 'PORT=1', rulesText: 'PORT:number' });
  });

  it('is not history-eligible (.env content routinely embeds real secrets)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
