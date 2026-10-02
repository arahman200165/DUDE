import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './http-status.workspace-step';

describe('http-status workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips filterText through snapshot and restore', () => {
    workspaceStep.restore({ filterText: '404' });
    expect(workspaceStep.snapshot()?.state).toEqual({ filterText: '404' });
  });

  it('is not history-eligible (reference table)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
