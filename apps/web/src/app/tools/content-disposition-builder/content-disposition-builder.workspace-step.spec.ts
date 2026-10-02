import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './content-disposition-builder.workspace-step';

describe('content-disposition-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'attachment; filename="a.pdf"' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'attachment; filename="a.pdf"' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
