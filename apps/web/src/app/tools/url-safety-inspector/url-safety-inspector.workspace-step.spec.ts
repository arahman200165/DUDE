import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './url-safety-inspector.workspace-step';

describe('url-safety-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'https://example.com/login' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'https://example.com/login' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
