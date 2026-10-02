import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './url-inspector.workspace-step';

describe('url-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'https://example.com/a?b=1' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'https://example.com/a?b=1' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
