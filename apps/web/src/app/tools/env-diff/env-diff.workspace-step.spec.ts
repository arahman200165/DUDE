import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './env-diff.workspace-step';

describe('env-diff workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides through snapshot and restore', () => {
    workspaceStep.restore({ before: 'A=1', after: 'A=2' });
    expect(workspaceStep.snapshot()?.state).toEqual({ before: 'A=1', after: 'A=2' });
  });

  it('is not history-eligible (.env content routinely embeds real secrets)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
