import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './template-renderer.workspace-step';

describe('template-renderer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips template/context through snapshot and restore', () => {
    workspaceStep.restore({ template: 'Hi <%= name %>', context: '{"name":"x"}' });
    expect(workspaceStep.snapshot()?.state).toEqual({ template: 'Hi <%= name %>', context: '{"name":"x"}' });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
