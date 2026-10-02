import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csp-builder.workspace-step';

describe('csp-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: "default-src 'none'" });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: "default-src 'none'" });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
