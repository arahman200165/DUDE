import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ksuid-tools.workspace-step';

describe('ksuid-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list through snapshot and restore', () => {
    workspaceStep.restore({ generated: ['0ujsswThIGTUYm2K8FjOOfXtY1K'], inspectInput: '' });
    expect(workspaceStep.snapshot()?.state).toEqual({ generated: ['0ujsswThIGTUYm2K8FjOOfXtY1K'], inspectInput: '' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
