import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './mime-types.workspace-step';

describe('mime-types workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips filter fields through snapshot and restore', () => {
    workspaceStep.restore({ filterText: 'json', topLevelFilter: 'application' });
    expect(workspaceStep.snapshot()?.state).toEqual({ filterText: 'json', topLevelFilter: 'application' });
  });

  it('is not history-eligible (reference table)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
